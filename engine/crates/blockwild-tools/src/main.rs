use std::env;
use std::fmt::Write as _;
use std::fs;
use std::hint::black_box;
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use blockwild_engine::{ENGINE_VERSION, Engine, EngineConfig};
use blockwild_persistence::{PersistenceWireRecord, decode_record, inspect_checkpoint};
use blockwild_protocol::{PROTOCOL_VERSION, ReplayFrame, ReplayHeader, ReplayLog};
use blockwild_render::SceneFixture;
#[cfg(not(target_arch = "wasm32"))]
use blockwild_render::{SMOKE_HEIGHT, SMOKE_WIDTH, SmokeStatus, smoke_offscreen_artifact_blocking};
use blockwild_types::{
    Aabb, AabbBatchQuery, CanonicalHash, Ray, RayBatchQuery, SpatialEntry, SpatialIndex, StableId, block_index,
    fnv1a_utf16_units, hash2, hash2_bits, hash3, hash3_bits, split_coordinate,
};

fn main() -> ExitCode {
    match run(env::args().skip(1).collect()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("blockwild-tools: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: Vec<String>) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("replay-self-test") => replay_self_test(),
        Some("replay") => replay_file(args.get(1).ok_or("replay requires a file path")?),
        Some("write-replay") => write_replay(args.get(1).ok_or("write-replay requires a file path")?),
        Some("benchmark") => benchmark(args.get(1).map_or(Ok(10_000), |value| value.parse::<u32>().map_err(|error| error.to_string()))?),
        Some("kernels-json") => {
            let input = match args.get(1).map(String::as_str) {
                Some("--input") => Some(args.get(2).ok_or("kernels-json --input requires a UTF-8 seed corpus path")?.as_str()),
                Some(_) => return Err("kernels-json accepts only optional --input FILE".into()),
                None => None,
            };
            kernels_json(input)
        }
        Some("render-fixture") => {
            let fixture = SceneFixture::smoke();
            println!("fixture={} hash={} bytes={}", fixture.name, fixture.canonical_hash().to_hex(), fixture.envelope().encode().len());
            Ok(())
        }
        Some("render-smoke") => {
            let output = match args.get(1).map(String::as_str) {
                Some("--output") => Some(args.get(2).ok_or("render-smoke --output requires a file path")?.as_str()),
                Some(path) => Some(path),
                None => None,
            };
            render_smoke(output)
        }
        Some("save-inspect") => save_inspect(args.get(1).ok_or("save-inspect requires a persistence wire file")?),
        _ => Err("usage: blockwild-tools <replay-self-test|replay FILE|write-replay FILE|benchmark [ITERATIONS]|kernels-json [--input FILE]|render-fixture|render-smoke [--output] FILE|save-inspect FILE>".into()),
    }
}

fn save_inspect(path: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|error| format!("cannot read persistence record {path}: {error}"))?;
    match decode_record(&bytes).map_err(|error| error.to_string())? {
        PersistenceWireRecord::Checkpoint(checkpoint) => {
            let report = inspect_checkpoint(&checkpoint);
            println!(
                "save=checkpoint valid={} checkpoint={} world={} journal={} records={} bytes={} hash={}",
                report.valid,
                report.checkpoint_id,
                report.world_id,
                report.journal_sequence,
                report.records,
                report.bytes,
                checkpoint.checkpoint_hash.to_hex(),
            );
            if let Some(issue) = report.issue {
                return Err(issue.to_string());
            }
        }
        PersistenceWireRecord::Transaction(transaction) => println!(
            "save=transaction id={} world={} expected={} next={} mutations={} bytes={} hash={}",
            transaction.transaction_id,
            transaction.world_id,
            transaction.expected_journal_sequence,
            transaction.next_journal_sequence,
            transaction.mutations.len(),
            transaction.byte_length,
            transaction.transaction_hash.to_hex(),
        ),
        PersistenceWireRecord::Migration(bundle) => println!(
            "save=migration source={} world={} normalized_bytes={} source_hash={} normalized_hash={} migration_hash={}",
            bundle.source_key,
            bundle.world_id,
            bundle.normalized_payload.len(),
            bundle.source_hash.to_hex(),
            bundle.normalized_hash.to_hex(),
            bundle.migration_hash.to_hex(),
        ),
    }
    Ok(())
}

fn kernels_json(input_path: Option<&str>) -> Result<(), String> {
    let coordinate_values = [-33, -17, -16, -1, 0, 1, 15, 16, 17, 31, 32];
    let coordinates = coordinate_values
        .into_iter()
        .map(|world| {
            let (chunk, local) = split_coordinate(world);
            format!("{{\"world\":{world},\"chunk\":{chunk},\"local\":{local}}}")
        })
        .collect::<Vec<_>>()
        .join(",");
    let block_vectors = [(0, -64, 0), (15, -64, 15), (0, -63, 0), (7, 0, 9), (15, 127, 15)];
    let blocks = block_vectors
        .into_iter()
        .map(|(x, y, z)| {
            block_index(x, y, z)
                .map(|index| format!("{{\"x\":{x},\"y\":{y},\"z\":{z},\"index\":{index}}}"))
                .map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?
        .join(",");

    let mut seed_records: Vec<(String, Option<String>, Vec<u16>)> = vec![
        ("empty".into(), Some(String::new()), Vec::new()),
        (
            "ascii".into(),
            Some("Blockwild".into()),
            "Blockwild".encode_utf16().collect(),
        ),
        (
            "emoji-pair".into(),
            Some("A🌿B".into()),
            "A🌿B".encode_utf16().collect(),
        ),
        (
            "combining-mark".into(),
            Some("e\u{301}".into()),
            "e\u{301}".encode_utf16().collect(),
        ),
        ("lone-high-surrogate".into(), None, vec![0xd83c]),
        ("lone-low-surrogate".into(), None, vec![0xdf3f]),
    ];
    if let Some(path) = input_path {
        let corpus =
            fs::read_to_string(path).map_err(|error| format!("cannot read kernel seed corpus {path}: {error}"))?;
        for (index, line) in corpus.lines().filter(|line| !line.is_empty()).enumerate() {
            seed_records.push((
                format!("input-{index}"),
                Some(line.into()),
                line.encode_utf16().collect(),
            ));
        }
    }
    let seeds = seed_records
        .iter()
        .map(|(label, text, units)| {
            let unit_json = units.iter().map(u16::to_string).collect::<Vec<_>>().join(",");
            format!(
                "{{\"label\":{},\"text\":{},\"utf16Units\":[{unit_json}],\"fnv1aUtf16\":{}}}",
                json_quote(label),
                text.as_ref().map_or_else(|| "null".into(), |value| json_quote(value)),
                fnv1a_utf16_units(units),
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    let hash2_vectors = [(0, 0, 0), (-17, 33, 3_449_464_762), (i32::MAX, i32::MIN, 3_687_954_586)];
    let hash2_json = hash2_vectors
        .into_iter()
        .map(|(x, z, seed)| {
            format!(
                "{{\"x\":{x},\"z\":{z},\"seed\":{seed},\"bits\":{},\"unit\":{:.17}}}",
                hash2_bits(x, z, seed),
                hash2(x, z, seed),
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let hash3_vectors = [
        (0, 0, 0, 0),
        (-17, -64, 33, 3_449_464_762),
        (i32::MAX, 127, i32::MIN, 3_687_954_586),
    ];
    let hash3_json = hash3_vectors
        .into_iter()
        .map(|(x, y, z, seed)| {
            format!(
                "{{\"x\":{x},\"y\":{y},\"z\":{z},\"seed\":{seed},\"bits\":{},\"unit\":{:.17}}}",
                hash3_bits(x, y, z, seed),
                hash3(x, y, z, seed),
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let stable_ids = [(1, 1), (0x1234_5678, 0x90ab_cdef), (u32::MAX, u32::MAX)]
        .into_iter()
        .map(|(index, generation)| {
            let id = StableId::new(index, generation);
            format!(
                "{{\"index\":{index},\"generation\":{generation},\"packedHex\":\"{:016x}\"}}",
                id.packed()
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    let mut spatial = SpatialIndex::new(4.0);
    for entry in [
        SpatialEntry {
            id: StableId::new(7, 1),
            bounds: Aabb::new([2.0, 0.0, 0.0], [3.0, 1.0, 1.0]),
        },
        SpatialEntry {
            id: StableId::new(2, 1),
            bounds: Aabb::new([6.0, 0.0, 0.0], [7.0, 1.0, 1.0]),
        },
        SpatialEntry {
            id: StableId::new(11, 1),
            bounds: Aabb::new([-3.0, -1.0, -2.0], [-1.0, 2.0, 0.0]),
        },
    ] {
        spatial.upsert(entry);
    }
    let aabb_results = spatial.query_aabb_batch(&[
        AabbBatchQuery {
            query_id: 9,
            bounds: Aabb::new([-4.0, -2.0, -3.0], [4.0, 3.0, 2.0]),
        },
        AabbBatchQuery {
            query_id: 3,
            bounds: Aabb::new([0.0, 0.0, 0.0], [8.0, 2.0, 2.0]),
        },
    ]);
    let aabb_json = aabb_results
        .iter()
        .map(|result| {
            let ids = result
                .ids
                .iter()
                .map(|id| format!("\"{:016x}\"", id.packed()))
                .collect::<Vec<_>>()
                .join(",");
            format!("{{\"queryId\":{},\"ids\":[{ids}]}}", result.query_id)
        })
        .collect::<Vec<_>>()
        .join(",");
    let ray_results = spatial.query_ray_batch(&[
        RayBatchQuery {
            query_id: 9,
            ray: Ray {
                origin: [0.0, 0.5, 0.5],
                direction: [1.0, 0.0, 0.0],
                max_distance: 10.0,
            },
        },
        RayBatchQuery {
            query_id: 3,
            ray: Ray {
                origin: [0.0, 0.5, 0.5],
                direction: [1.0, 0.0, 0.0],
                max_distance: 4.0,
            },
        },
    ]);
    let ray_json = ray_results
        .iter()
        .map(|result| {
            let hits = result
                .hits
                .iter()
                .map(|(id, distance)| {
                    format!(
                        "{{\"id\":\"{:016x}\",\"distance\":{distance:.17},\"distanceBits\":\"{:016x}\"}}",
                        id.packed(),
                        distance.to_bits(),
                    )
                })
                .collect::<Vec<_>>()
                .join(",");
            format!("{{\"queryId\":{},\"hits\":[{hits}]}}", result.query_id)
        })
        .collect::<Vec<_>>()
        .join(",");

    let replay = canonical_replay();
    let replay_bytes = replay.encode();
    let encoded_hex = hex_bytes(&replay_bytes);
    let final_hash = replay
        .frames
        .last()
        .map_or(replay.header.starting_hash, |frame| frame.expected_hash);
    let input_json = input_path.map_or_else(|| "null".into(), json_quote);
    println!(
        "{{\"schema\":\"blockwild-kernel-fixtures-v1\",\"engineVersion\":{ENGINE_VERSION},\"protocolVersion\":{PROTOCOL_VERSION},\"inputSource\":{input_json},\"coordinates\":[{coordinates}],\"blockIndices\":[{blocks}],\"seeds\":[{seeds}],\"hash2\":[{hash2_json}],\"hash3\":[{hash3_json}],\"stableIds\":[{stable_ids}],\"aabbBatches\":[{aabb_json}],\"rayBatches\":[{ray_json}],\"replay\":{{\"frameCount\":{},\"startingHash\":\"{}\",\"finalHash\":\"{}\",\"canonicalHash\":\"{}\",\"encodedHex\":\"{encoded_hex}\"}}}}",
        replay.frames.len(),
        replay.header.starting_hash.to_hex(),
        final_hash.to_hex(),
        replay.canonical_hash().to_hex(),
    );
    Ok(())
}

fn json_quote(value: &str) -> String {
    let mut output = String::with_capacity(value.len() + 2);
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            value if value.is_control() => {
                write!(&mut output, "\\u{:04x}", value as u32).expect("String writes cannot fail")
            }
            value => output.push(value),
        }
    }
    output.push('"');
    output
}

fn hex_bytes(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut output, "{byte:02x}").expect("String writes cannot fail");
    }
    output
}

fn canonical_replay() -> ReplayLog {
    let config = EngineConfig {
        world_seed: "rust-r1-golden".into(),
        ..EngineConfig::default()
    };
    let mut engine = Engine::new(config.clone());
    let first = engine.apply_replay_frame(1, b"move:north", b"");
    let second = engine.apply_replay_frame(2, b"place:stone", b"save:ok");
    ReplayLog {
        header: ReplayHeader {
            engine_version: ENGINE_VERSION,
            protocol_version: PROTOCOL_VERSION,
            content_hash: config.content_hash,
            generator_hash: config.generator_hash,
            world_seed: config.world_seed,
            starting_hash: Engine::new(EngineConfig {
                world_seed: "rust-r1-golden".into(),
                ..EngineConfig::default()
            })
            .state_hash(),
        },
        frames: vec![
            ReplayFrame {
                tick: 1,
                command_batch: b"move:north".to_vec(),
                platform_results: Vec::new(),
                expected_hash: first,
            },
            ReplayFrame {
                tick: 2,
                command_batch: b"place:stone".to_vec(),
                platform_results: b"save:ok".to_vec(),
                expected_hash: second,
            },
        ],
    }
}

fn replay_self_test() -> Result<(), String> {
    let replay = canonical_replay();
    verify_replay(&replay)?;
    let encoded = replay.encode();
    let decoded = ReplayLog::decode(&encoded).map_err(|error| error.to_string())?;
    verify_replay(&decoded)?;
    println!(
        "replay=ok frames={} bytes={} hash={}",
        decoded.frames.len(),
        encoded.len(),
        decoded.canonical_hash().to_hex()
    );
    Ok(())
}

fn replay_file(path: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|error| format!("cannot read {path}: {error}"))?;
    let replay = ReplayLog::decode(&bytes).map_err(|error| error.to_string())?;
    verify_replay(&replay)?;
    println!(
        "replay=ok path={path} frames={} hash={}",
        replay.frames.len(),
        replay.canonical_hash().to_hex()
    );
    Ok(())
}

fn write_replay(path: &str) -> Result<(), String> {
    let replay = canonical_replay();
    verify_replay(&replay)?;
    let path = Path::new(path);
    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
    }
    fs::write(path, replay.encode()).map_err(|error| format!("cannot write {}: {error}", path.display()))?;
    println!(
        "replay=written path={} hash={}",
        path.display(),
        replay.canonical_hash().to_hex()
    );
    Ok(())
}

fn verify_replay(replay: &ReplayLog) -> Result<(), String> {
    if replay.header.engine_version != ENGINE_VERSION || replay.header.protocol_version != PROTOCOL_VERSION {
        return Err("replay version does not match this tool".into());
    }
    let config = EngineConfig {
        world_seed: replay.header.world_seed.clone(),
        content_hash: replay.header.content_hash,
        generator_hash: replay.header.generator_hash,
    };
    let mut engine = Engine::new(config);
    if engine.state_hash() != replay.header.starting_hash {
        return Err(format!(
            "starting hash mismatch: {} != {}",
            engine.state_hash().to_hex(),
            replay.header.starting_hash.to_hex()
        ));
    }
    for frame in &replay.frames {
        let actual = engine.apply_replay_frame(frame.tick, &frame.command_batch, &frame.platform_results);
        if actual != frame.expected_hash {
            return Err(format!(
                "tick {} hash mismatch: {} != {}",
                frame.tick,
                actual.to_hex(),
                frame.expected_hash.to_hex()
            ));
        }
    }
    Ok(())
}

fn benchmark(iterations: u32) -> Result<(), String> {
    if iterations == 0 {
        return Err("benchmark iterations must be positive".into());
    }
    let mut index = SpatialIndex::new(8.0);
    for id in 1..=2_048_u32 {
        let x = f64::from(id % 64);
        let z = f64::from(id / 64);
        index.upsert(SpatialEntry {
            id: StableId::new(id, 1),
            bounds: Aabb::new([x, 0.0, z], [x + 0.8, 1.8, z + 0.8]),
        });
    }
    let aabb = [AabbBatchQuery {
        query_id: 1,
        bounds: Aabb::new([20.0, -1.0, 10.0], [36.0, 3.0, 26.0]),
    }];
    let ray = [RayBatchQuery {
        query_id: 2,
        ray: Ray {
            origin: [0.0, 0.9, 12.4],
            direction: [1.0, 0.0, 0.0],
            max_distance: 64.0,
        },
    }];
    let started = Instant::now();
    let mut result_count = 0_usize;
    for _ in 0..iterations {
        result_count = result_count.wrapping_add(black_box(index.query_aabb_batch(&aabb)[0].ids.len()));
        result_count = result_count.wrapping_add(black_box(index.query_ray_batch(&ray)[0].hits.len()));
    }
    let elapsed = started.elapsed();
    println!(
        "benchmark=spatial iterations={iterations} entries=2048 elapsed_ms={:.3} ns_per_batch={:.1} checksum={result_count}",
        elapsed.as_secs_f64() * 1_000.0,
        elapsed.as_nanos() as f64 / f64::from(iterations) / 2.0,
    );
    Ok(())
}

#[cfg(not(target_arch = "wasm32"))]
fn render_smoke(output_path: Option<&str>) -> Result<(), String> {
    let artifact = smoke_offscreen_artifact_blocking();
    let diagnostic = &artifact.diagnostics;
    let image_hash = diagnostic
        .image_hash
        .map_or_else(|| "none".into(), CanonicalHash::to_hex);
    println!(
        "render_status={:?} backend={} adapter={:?} device_type={} driver={:?} fixture_hash={} image_hash={} max_texture_2d={} max_storage_buffer={} message={:?}",
        diagnostic.status,
        diagnostic.backend,
        diagnostic.adapter_name,
        diagnostic.device_type,
        diagnostic.driver,
        diagnostic.fixture_hash.to_hex(),
        image_hash,
        diagnostic.max_texture_dimension_2d,
        diagnostic.max_storage_buffer_binding_size,
        diagnostic.message,
    );
    if let Some(path) = output_path {
        if Path::new(path).extension().and_then(|extension| extension.to_str()) != Some("ppm") {
            return Err("renderer evidence output must use the .ppm extension".into());
        }
        if artifact.rgba8.len() != (SMOKE_WIDTH * SMOKE_HEIGHT * 4) as usize {
            return Err("renderer did not return the expected RGBA readback".into());
        }
        let mut ppm = format!("P6\n{SMOKE_WIDTH} {SMOKE_HEIGHT}\n255\n").into_bytes();
        ppm.reserve((SMOKE_WIDTH * SMOKE_HEIGHT * 3) as usize);
        for pixel in artifact.rgba8.chunks_exact(4) {
            ppm.extend_from_slice(&pixel[..3]);
        }
        fs::write(path, ppm).map_err(|error| format!("cannot write renderer evidence {path}: {error}"))?;
        println!("render_evidence={path}");
    }
    match diagnostic.status {
        SmokeStatus::Rendered | SmokeStatus::AdapterUnavailable => Ok(()),
        SmokeStatus::DeviceUnavailable | SmokeStatus::ValidationFailed | SmokeStatus::ReadbackFailed => {
            Err(diagnostic.message.clone())
        }
    }
}

#[cfg(target_arch = "wasm32")]
fn render_smoke(_output_path: Option<&str>) -> Result<(), String> {
    Err("render-smoke is a native CLI command; browser smoke uses the async renderer path".into())
}

#[allow(dead_code)]
fn _assert_hash_size(_: CanonicalHash) {
    assert_eq!(size_of::<CanonicalHash>(), 16);
}
