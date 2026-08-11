struct CameraUniform {
    view_projection: mat4x4<f32>,
    camera_position: vec4<f32>,
    ambient: vec4<f32>,
    sun_direction_intensity: vec4<f32>,
    sun_color: vec4<f32>,
    fog_color_near: vec4<f32>,
    fog_far_underwater_cave: vec4<f32>,
    lighting_config: vec4<f32>,
    held_position_radius: vec4<f32>,
    held_color_intensity: vec4<f32>,
    machine_position_radius: vec4<f32>,
    machine_color_intensity: vec4<f32>,
};

struct MaterialUniform {
    base_color: vec4<f32>,
    emissive_strength: vec4<f32>,
    surface: vec4<f32>,
    render_flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> material: MaterialUniform;
@group(1) @binding(1) var atlas_texture: texture_2d<f32>;
@group(1) @binding(2) var atlas_sampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) light: vec4<f32>,
    @location(4) emission: f32,
    @location(5) uv: vec2<f32>,
    @location(6) occlusion: f32,
    @location(7) model_0: vec4<f32>,
    @location(8) model_1: vec4<f32>,
    @location(9) model_2: vec4<f32>,
    @location(10) model_3: vec4<f32>,
    @location(11) tint: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) light: vec4<f32>,
    @location(4) emission: f32,
    @location(5) uv: vec2<f32>,
    @location(6) occlusion: f32,
};

@vertex
fn vertex_main(input: VertexInput) -> VertexOutput {
    let model = mat4x4<f32>(input.model_0, input.model_1, input.model_2, input.model_3);
    let world = model * vec4<f32>(input.position, 1.0);
    var output: VertexOutput;
    output.clip_position = camera.view_projection * world;
    output.world_position = world.xyz;
    output.world_normal = normalize((model * vec4<f32>(input.normal, 0.0)).xyz);
    output.color = input.color * input.tint;
    output.light = input.light;
    output.emission = input.emission;
    output.uv = input.uv;
    output.occlusion = input.occlusion;
    return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let shading = u32(round(material.surface.w));
    let blend = u32(round(material.render_flags.x));
    let atlas_tile = material.render_flags.y;
    let has_real_atlas = material.render_flags.z > 0.5;
    var atlas_tone = 1.0;
    var atlas_color = vec4<f32>(1.0);
    if (atlas_tile >= 0.0 && has_real_atlas) {
        var sample_uv = input.uv;
        if (blend == 4u) {
            let tile = floor(sample_uv * 16.0);
            var local_uv = fract(sample_uv * 16.0);
            local_uv.x = fract(local_uv.x + camera.lighting_config.z);
            local_uv = clamp(local_uv, vec2<f32>(0.014), vec2<f32>(0.986));
            sample_uv = (tile + local_uv) / 16.0;
        }
        atlas_color = textureSample(atlas_texture, atlas_sampler, vec2<f32>(sample_uv.x, 1.0 - sample_uv.y));
    } else if (atlas_tile >= 0.0) {
        let atlas_cell = floor(input.uv * 16.0);
        let noise = fract(sin(dot(atlas_cell + vec2<f32>(atlas_tile, atlas_tile * 0.37), vec2<f32>(12.9898, 78.233))) * 43758.5453);
        atlas_tone = mix(0.90, 1.08, noise);
    }
    var base = material.base_color * input.color * atlas_color;
    if (has_real_atlas) {
        // Three restores PACKED_VERTEX_COLOR_RANGE=1.1 on every voxel
        // material because the immutable vertex colors are packed as /1.1.
        base = vec4<f32>(base.rgb * 1.1, base.a);
    }
    base = vec4<f32>(base.rgb * atlas_tone, base.a);
    if (base.a < material.surface.z) {
        discard;
    }
    let sun_direction = normalize(camera.sun_direction_intensity.xyz);
    let normal = normalize(input.world_normal);
    let view_direction = normalize(camera.camera_position.xyz - input.world_position);
    let diffuse = max(dot(normal, sun_direction), 0.0);
    let sky = pow(clamp(input.light.x, 0.0, 1.0), 1.22);
    let block_light = pow(clamp(input.light.yzw, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.32)) * camera.lighting_config.x;
    var lit = vec3<f32>(camera.lighting_config.y)
        + camera.ambient.rgb * sky * camera.ambient.a
        + camera.sun_color.rgb * camera.sun_direction_intensity.w * diffuse * sky
        + block_light;
    let held_delta = camera.held_position_radius.xyz - input.world_position;
    let held_distance = length(held_delta);
    var held_attenuation = 0.0;
    var held_facing = 1.0;
    if (camera.held_position_radius.w > 0.0) {
        held_attenuation = pow(clamp(1.0 - held_distance / camera.held_position_radius.w, 0.0, 1.0), 1.45);
    }
    if (held_distance > 0.0001) {
        held_facing = max(dot(normal, held_delta / held_distance), 0.0);
    }
    lit += camera.held_color_intensity.rgb * camera.held_color_intensity.w * held_attenuation * (0.16 + held_facing * 0.84);
    let machine_delta = camera.machine_position_radius.xyz - input.world_position;
    let machine_distance = length(machine_delta);
    var machine_attenuation = 0.0;
    var machine_facing = 1.0;
    if (camera.machine_position_radius.w > 0.0) {
        machine_attenuation = pow(clamp(1.0 - machine_distance / camera.machine_position_radius.w, 0.0, 1.0), 1.7);
    }
    if (machine_distance > 0.0001) {
        machine_facing = max(dot(normal, machine_delta / machine_distance), 0.0);
    }
    lit += camera.machine_color_intensity.rgb * camera.machine_color_intensity.w * machine_attenuation * (0.2 + machine_facing * 0.8);
    lit *= input.occlusion;
    if (shading == 0u || shading == 3u || shading == 4u) {
        lit = vec3<f32>(1.0);
    }
    let emissive = material.emissive_strength.rgb * material.emissive_strength.a + base.rgb * input.emission;
    var color = base.rgb * lit + emissive;
    if (shading == 2u) {
        let halfway = normalize(sun_direction + view_direction);
        let gloss = max(2.0, mix(96.0, 4.0, material.surface.x));
        let specular = pow(max(dot(normal, halfway), 0.0), gloss);
        color += camera.sun_color.rgb * specular * mix(0.08, 0.7, material.surface.y);
    }
    if (blend == 2u && shading == 2u) {
        let fresnel = pow(1.0 - max(dot(normal, view_direction), 0.0), 4.0);
        color += camera.sun_color.rgb * fresnel * 0.18;
    }
    let distance_to_camera = distance(input.world_position, camera.camera_position.xyz);
    let fog = clamp(
        (distance_to_camera - camera.fog_color_near.a)
            / max(camera.fog_far_underwater_cave.x - camera.fog_color_near.a, 0.001),
        0.0,
        1.0,
    );
    color = mix(color, camera.fog_color_near.rgb, fog);
    return vec4<f32>(color, base.a);
}
