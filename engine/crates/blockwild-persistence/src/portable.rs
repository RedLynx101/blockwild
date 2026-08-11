//! Chunked portable archive and compatibility export primitives.

use crate::{Checkpoint, PersistenceError, RecordAddress, RecordDescriptor, RecordKind, payload_hash};
use blockwild_types::{CanonicalHash, CanonicalHasher};

pub const PORTABLE_ARCHIVE_SCHEMA_V1: u16 = 1;
pub const PORTABLE_ARCHIVE_MAX_FRAME_BYTES_V1: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortableArchiveHeaderV1 {
    pub world_id: String,
    pub checkpoint_id: String,
    pub checkpoint_hash: CanonicalHash,
    pub generator_hash: CanonicalHash,
    pub content_hash: CanonicalHash,
    pub journal_sequence: u64,
    pub record_count: u32,
    pub archive_hash: CanonicalHash,
}

impl PortableArchiveHeaderV1 {
    pub fn from_checkpoint(checkpoint: &Checkpoint) -> Result<Self, PersistenceError> {
        checkpoint.verify()?;
        let archive_hash = archive_hash(checkpoint);
        Ok(Self {
            world_id: checkpoint.world_id.clone(),
            checkpoint_id: checkpoint.checkpoint_id.clone(),
            checkpoint_hash: checkpoint.checkpoint_hash,
            generator_hash: checkpoint.generator_hash,
            content_hash: checkpoint.content_hash,
            journal_sequence: checkpoint.journal_sequence,
            record_count: checkpoint.records.len() as u32,
            archive_hash,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PortableArchiveFrameV1 {
    Begin(PortableArchiveHeaderV1),
    RecordChunk {
        index: u32,
        descriptor: RecordDescriptor,
        offset: u64,
        bytes: Vec<u8>,
        final_chunk: bool,
    },
    End {
        archive_hash: CanonicalHash,
    },
}

pub fn encode_portable_archive_frame_v1(frame: &PortableArchiveFrameV1) -> Result<Vec<u8>, PersistenceError> {
    let mut payload = Writer::default();
    let tag = match frame {
        PortableArchiveFrameV1::Begin(value) => {
            payload.string(&value.world_id)?;
            payload.string(&value.checkpoint_id)?;
            payload.hash(value.checkpoint_hash);
            payload.hash(value.generator_hash);
            payload.hash(value.content_hash);
            payload.u64(value.journal_sequence);
            payload.u32(value.record_count);
            payload.hash(value.archive_hash);
            1
        }
        PortableArchiveFrameV1::RecordChunk {
            index,
            descriptor,
            offset,
            bytes,
            final_chunk,
        } => {
            if bytes.len() > PORTABLE_ARCHIVE_MAX_FRAME_BYTES_V1
                || (bytes.is_empty() && (*offset != 0 || descriptor.byte_length != 0 || !*final_chunk))
            {
                return Err(PersistenceError::new(
                    "portable-frame-size",
                    "portable record chunk is outside its V1 bounds",
                ));
            }
            if offset.saturating_add(bytes.len() as u64) > u64::from(descriptor.byte_length) {
                return Err(PersistenceError::new(
                    "portable-frame",
                    "portable record chunk exceeds its descriptor",
                ));
            }
            payload.u32(*index);
            payload.address(&descriptor.address)?;
            payload.u64(descriptor.revision);
            payload.u32(descriptor.byte_length);
            payload.hash(descriptor.payload_hash);
            payload.u64(*offset);
            payload.u8(u8::from(*final_chunk));
            payload.bytes(bytes)?;
            2
        }
        PortableArchiveFrameV1::End { archive_hash } => {
            payload.hash(*archive_hash);
            3
        }
    };
    let payload = payload.finish();
    let mut output = Writer::default();
    output.raw(b"BWEX");
    output.u16(PORTABLE_ARCHIVE_SCHEMA_V1);
    output.u16(tag);
    output.u32(
        u32::try_from(payload.len())
            .map_err(|_| PersistenceError::new("portable-frame-size", "portable frame exceeds u32"))?,
    );
    output.hash(frame_hash(&payload));
    output.raw(&payload);
    let bytes = output.finish();
    if bytes.len() > PORTABLE_ARCHIVE_MAX_FRAME_BYTES_V1 + 32 * 1024 {
        return Err(PersistenceError::new(
            "portable-frame-size",
            "portable frame exceeds its V1 transport budget",
        ));
    }
    Ok(bytes)
}

pub fn decode_portable_archive_frame_v1(bytes: &[u8]) -> Result<PortableArchiveFrameV1, PersistenceError> {
    let mut reader = Reader::new(bytes);
    if reader.take(4)? != b"BWEX" {
        return Err(PersistenceError::new(
            "portable-magic",
            "portable archive frame magic mismatch",
        ));
    }
    if reader.u16()? != PORTABLE_ARCHIVE_SCHEMA_V1 {
        return Err(PersistenceError::new(
            "portable-schema",
            "unsupported portable archive schema",
        ));
    }
    let tag = reader.u16()?;
    let length = reader.u32()? as usize;
    let expected_hash = reader.hash()?;
    let payload = reader.take(length)?;
    reader.finish()?;
    if frame_hash(payload) != expected_hash {
        return Err(PersistenceError::new(
            "portable-checksum",
            "portable archive frame checksum mismatch",
        ));
    }
    let mut payload = Reader::new(payload);
    let frame = match tag {
        1 => PortableArchiveFrameV1::Begin(PortableArchiveHeaderV1 {
            world_id: payload.string()?,
            checkpoint_id: payload.string()?,
            checkpoint_hash: payload.hash()?,
            generator_hash: payload.hash()?,
            content_hash: payload.hash()?,
            journal_sequence: payload.u64()?,
            record_count: payload.u32()?,
            archive_hash: payload.hash()?,
        }),
        2 => {
            let index = payload.u32()?;
            let descriptor = RecordDescriptor {
                address: payload.address()?,
                revision: payload.u64()?,
                byte_length: payload.u32()?,
                payload_hash: payload.hash()?,
            };
            let offset = payload.u64()?;
            let final_chunk = payload.flag()?;
            let chunk = payload.bytes(PORTABLE_ARCHIVE_MAX_FRAME_BYTES_V1)?;
            if (chunk.is_empty() && (offset != 0 || descriptor.byte_length != 0 || !final_chunk))
                || offset.saturating_add(chunk.len() as u64) > u64::from(descriptor.byte_length)
            {
                return Err(PersistenceError::new(
                    "portable-frame",
                    "portable record chunk exceeds its descriptor",
                ));
            }
            PortableArchiveFrameV1::RecordChunk {
                index,
                descriptor,
                offset,
                bytes: chunk,
                final_chunk,
            }
        }
        3 => PortableArchiveFrameV1::End {
            archive_hash: payload.hash()?,
        },
        _ => {
            return Err(PersistenceError::new(
                "portable-kind",
                "unknown portable archive frame kind",
            ));
        }
    };
    payload.finish()?;
    Ok(frame)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PortableImportActionV1 {
    None,
    StoreRecord {
        descriptor: RecordDescriptor,
        payload: Vec<u8>,
    },
    Complete {
        header: PortableArchiveHeaderV1,
    },
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PortableImportV1 {
    header: Option<PortableArchiveHeaderV1>,
    next_index: u32,
    current_descriptor: Option<RecordDescriptor>,
    current_payload: Vec<u8>,
    complete: bool,
}

impl PortableImportV1 {
    pub fn accept(&mut self, frame: PortableArchiveFrameV1) -> Result<PortableImportActionV1, PersistenceError> {
        if self.complete {
            return Err(PersistenceError::new(
                "portable-complete",
                "portable import already completed",
            ));
        }
        match frame {
            PortableArchiveFrameV1::Begin(header) => {
                if self.header.is_some() {
                    return Err(PersistenceError::new(
                        "portable-order",
                        "portable import contains a duplicate begin frame",
                    ));
                }
                self.header = Some(header);
                Ok(PortableImportActionV1::None)
            }
            PortableArchiveFrameV1::RecordChunk {
                index,
                descriptor,
                offset,
                bytes,
                final_chunk,
            } => {
                if self.header.is_none() || index != self.next_index {
                    return Err(PersistenceError::new(
                        "portable-order",
                        "portable record index is not contiguous",
                    ));
                }
                if offset == 0 {
                    if self.current_descriptor.is_some() {
                        return Err(PersistenceError::new(
                            "portable-order",
                            "previous portable record is incomplete",
                        ));
                    }
                    self.current_descriptor = Some(descriptor.clone());
                } else if self.current_descriptor.as_ref() != Some(&descriptor)
                    || offset != self.current_payload.len() as u64
                {
                    return Err(PersistenceError::new(
                        "portable-order",
                        "portable record chunks are reordered or inconsistent",
                    ));
                }
                self.current_payload.extend_from_slice(&bytes);
                if !final_chunk {
                    return Ok(PortableImportActionV1::None);
                }
                if self.current_payload.len() != descriptor.byte_length as usize
                    || payload_hash(&self.current_payload) != descriptor.payload_hash
                {
                    return Err(PersistenceError::new(
                        "corrupt",
                        "portable record failed exact payload validation",
                    ));
                }
                self.next_index = self.next_index.saturating_add(1);
                self.current_descriptor = None;
                Ok(PortableImportActionV1::StoreRecord {
                    descriptor,
                    payload: std::mem::take(&mut self.current_payload),
                })
            }
            PortableArchiveFrameV1::End { archive_hash } => {
                let header = self
                    .header
                    .clone()
                    .ok_or_else(|| PersistenceError::new("portable-order", "portable archive has no begin frame"))?;
                if self.current_descriptor.is_some()
                    || self.next_index != header.record_count
                    || archive_hash != header.archive_hash
                {
                    return Err(PersistenceError::new(
                        "portable-completeness",
                        "portable archive ended before all validated records arrived",
                    ));
                }
                self.complete = true;
                Ok(PortableImportActionV1::Complete { header })
            }
        }
    }
}

pub fn portable_record_frames_v1(
    index: u32,
    descriptor: &RecordDescriptor,
    payload: &[u8],
    max_chunk_bytes: usize,
) -> Result<Vec<PortableArchiveFrameV1>, PersistenceError> {
    if max_chunk_bytes == 0
        || max_chunk_bytes > PORTABLE_ARCHIVE_MAX_FRAME_BYTES_V1
        || payload.len() != descriptor.byte_length as usize
        || payload_hash(payload) != descriptor.payload_hash
    {
        return Err(PersistenceError::new(
            "portable-record",
            "portable record input or chunk bound is invalid",
        ));
    }
    if payload.is_empty() {
        return Ok(vec![PortableArchiveFrameV1::RecordChunk {
            index,
            descriptor: descriptor.clone(),
            offset: 0,
            bytes: Vec::new(),
            final_chunk: true,
        }]);
    }
    Ok(payload
        .chunks(max_chunk_bytes)
        .enumerate()
        .map(|(chunk_index, bytes)| {
            let offset = chunk_index.saturating_mul(max_chunk_bytes) as u64;
            PortableArchiveFrameV1::RecordChunk {
                index,
                descriptor: descriptor.clone(),
                offset,
                bytes: bytes.to_vec(),
                final_chunk: offset.saturating_add(bytes.len() as u64) == payload.len() as u64,
            }
        })
        .collect())
}

fn archive_hash(checkpoint: &Checkpoint) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-portable-archive-v1");
    hasher.write_str(&checkpoint.world_id);
    hasher.write_str(&checkpoint.checkpoint_id);
    hasher.write_str(&checkpoint.checkpoint_hash.to_hex());
    hasher.write_u32(checkpoint.records.len() as u32);
    for record in &checkpoint.records {
        record.address.write_hash(&mut hasher);
        hasher.write_u64(record.revision);
        hasher.write_u32(record.byte_length);
        hasher.write_str(&record.payload_hash.to_hex());
    }
    hasher.finish()
}
fn frame_hash(payload: &[u8]) -> CanonicalHash {
    let mut hasher = CanonicalHasher::new("blockwild-portable-frame-v1");
    hasher.write_bytes(payload);
    hasher.finish()
}

#[derive(Default)]
struct Writer {
    bytes: Vec<u8>,
}
impl Writer {
    fn raw(&mut self, v: &[u8]) {
        self.bytes.extend_from_slice(v)
    }
    fn u8(&mut self, v: u8) {
        self.bytes.push(v)
    }
    fn u16(&mut self, v: u16) {
        self.raw(&v.to_le_bytes())
    }
    fn u32(&mut self, v: u32) {
        self.raw(&v.to_le_bytes())
    }
    fn u64(&mut self, v: u64) {
        self.raw(&v.to_le_bytes())
    }
    fn hash(&mut self, v: CanonicalHash) {
        self.raw(v.as_bytes())
    }
    fn bytes(&mut self, v: &[u8]) -> Result<(), PersistenceError> {
        self.u32(
            u32::try_from(v.len())
                .map_err(|_| PersistenceError::new("portable-frame-size", "portable field exceeds u32"))?,
        );
        self.raw(v);
        Ok(())
    }
    fn string(&mut self, v: &str) -> Result<(), PersistenceError> {
        self.bytes(v.as_bytes())
    }
    fn address(&mut self, v: &RecordAddress) -> Result<(), PersistenceError> {
        self.string(&v.universe_id)?;
        self.string(&v.location_id)?;
        self.u8(v.kind as u8);
        self.string(&v.record_id)
    }
    fn finish(self) -> Vec<u8> {
        self.bytes
    }
}
struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}
impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }
    fn take(&mut self, n: usize) -> Result<&'a [u8], PersistenceError> {
        let e = self
            .offset
            .checked_add(n)
            .ok_or_else(|| PersistenceError::new("portable-overflow", "portable offset overflow"))?;
        let v = self
            .bytes
            .get(self.offset..e)
            .ok_or_else(|| PersistenceError::new("portable-truncated", "portable frame is truncated"))?;
        self.offset = e;
        Ok(v)
    }
    fn u8(&mut self) -> Result<u8, PersistenceError> {
        Ok(self.take(1)?[0])
    }
    fn flag(&mut self) -> Result<bool, PersistenceError> {
        match self.u8()? {
            0 => Ok(false),
            1 => Ok(true),
            _ => Err(PersistenceError::new("portable-flag", "portable flag is invalid")),
        }
    }
    fn u16(&mut self) -> Result<u16, PersistenceError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().expect("fixed slice")))
    }
    fn u32(&mut self) -> Result<u32, PersistenceError> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("fixed slice")))
    }
    fn u64(&mut self) -> Result<u64, PersistenceError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().expect("fixed slice")))
    }
    fn hash(&mut self) -> Result<CanonicalHash, PersistenceError> {
        Ok(CanonicalHash(self.take(16)?.try_into().expect("fixed slice")))
    }
    fn bytes(&mut self, m: usize) -> Result<Vec<u8>, PersistenceError> {
        let n = self.u32()? as usize;
        if n > m {
            return Err(PersistenceError::new(
                "portable-frame-size",
                "portable field exceeds its budget",
            ));
        }
        Ok(self.take(n)?.to_vec())
    }
    fn string(&mut self) -> Result<String, PersistenceError> {
        String::from_utf8(self.bytes(4096)?)
            .map_err(|_| PersistenceError::new("portable-utf8", "portable string is invalid UTF-8"))
    }
    fn address(&mut self) -> Result<RecordAddress, PersistenceError> {
        RecordAddress::new(
            self.string()?,
            self.string()?,
            RecordKind::from_tag(self.u8()?)?,
            self.string()?,
        )
    }
    fn finish(&self) -> Result<(), PersistenceError> {
        if self.offset == self.bytes.len() {
            Ok(())
        } else {
            Err(PersistenceError::new(
                "portable-trailing",
                "portable frame contains trailing bytes",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_records_stream_without_a_monolithic_archive() {
        let address = RecordAddress::new("u", "surface", RecordKind::Entity, "e").unwrap();
        let payload = vec![7; 10];
        let descriptor = RecordDescriptor {
            address,
            revision: 1,
            byte_length: 10,
            payload_hash: payload_hash(&payload),
        };
        let checkpoint = Checkpoint::new(
            "cp",
            None,
            "world",
            1,
            CanonicalHash([1; 16]),
            CanonicalHash([2; 16]),
            1,
            vec![descriptor.clone()],
        )
        .unwrap();
        let header = PortableArchiveHeaderV1::from_checkpoint(&checkpoint).unwrap();
        let mut importer = PortableImportV1::default();
        assert_eq!(
            importer.accept(PortableArchiveFrameV1::Begin(header.clone())).unwrap(),
            PortableImportActionV1::None
        );
        let frames = portable_record_frames_v1(0, &descriptor, &payload, 4).unwrap();
        assert_eq!(frames.len(), 3);
        let mut stored = false;
        for frame in frames {
            if matches!(
                importer.accept(frame).unwrap(),
                PortableImportActionV1::StoreRecord { .. }
            ) {
                stored = true;
            }
        }
        assert!(stored);
        assert!(matches!(
            importer
                .accept(PortableArchiveFrameV1::End {
                    archive_hash: header.archive_hash
                })
                .unwrap(),
            PortableImportActionV1::Complete { .. }
        ));
    }
}
