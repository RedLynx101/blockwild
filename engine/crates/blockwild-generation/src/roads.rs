//! Deterministic surface-road graph and bounded terrain-following routing.
//!
//! The implementation mirrors `app/game/surface-roads.ts`. It is deliberately
//! renderer and world-state independent: callers provide immutable settlement
//! nodes and a pure terrain sampler, then own voxel extraction and markers.

use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug)]
pub(crate) struct RoadNode<T> {
    pub id: String,
    pub x: i32,
    pub z: i32,
    pub payload: T,
    pub degree_limit: usize,
}

#[derive(Clone, Debug)]
pub(crate) struct RoadEdge<T> {
    pub id: String,
    pub from: RoadNode<T>,
    pub to: RoadNode<T>,
    pub length: f64,
    pub looped: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RoadPointKind {
    Road,
    Switchback,
    Bridge,
    Causeway,
    Ferry,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct RoadPoint {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub kind: RoadPointKind,
    pub grade: i32,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct RoadSample {
    pub height: i32,
    pub waterline: i32,
    pub water: bool,
    pub forbidden: bool,
    pub slope_risk: f64,
}

fn distance<T>(left: &RoadNode<T>, right: &RoadNode<T>) -> f64 {
    f64::from(left.x - right.x).hypot(f64::from(left.z - right.z))
}

fn edge_id<T>(left: &RoadNode<T>, right: &RoadNode<T>) -> String {
    if left.id <= right.id {
        format!("{}<->{}", left.id, right.id)
    } else {
        format!("{}<->{}", right.id, left.id)
    }
}

pub(crate) fn regional_graph<T: Clone>(nodes: &[RoadNode<T>]) -> Vec<RoadEdge<T>> {
    let mut ordered = nodes.to_vec();
    ordered.sort_by(|left, right| left.id.cmp(&right.id));
    if ordered.len() < 2 {
        return Vec::new();
    }
    let mut degrees = ordered
        .iter()
        .map(|node| (node.id.clone(), 0_usize))
        .collect::<BTreeMap<_, _>>();
    let mut edges = Vec::new();
    let mut connected = BTreeSet::from([ordered[0].id.clone()]);
    while connected.len() < ordered.len() {
        let mut best: Option<(RoadNode<T>, RoadNode<T>, f64, String)> = None;
        for from in ordered.iter().filter(|node| connected.contains(&node.id)) {
            if degrees[&from.id] >= from.degree_limit {
                continue;
            }
            for to in ordered.iter().filter(|node| !connected.contains(&node.id)) {
                if degrees[&to.id] >= to.degree_limit {
                    continue;
                }
                let length = distance(from, to);
                if length > 1_200.0 {
                    continue;
                }
                let id = edge_id(from, to);
                if best.as_ref().is_none_or(|(_, _, best_length, best_id)| {
                    length < *best_length || (length == *best_length && id < *best_id)
                }) {
                    best = Some((from.clone(), to.clone(), length, id));
                }
            }
        }
        let Some((from, to, length, id)) = best else {
            break;
        };
        edges.push(RoadEdge {
            id,
            from: from.clone(),
            to: to.clone(),
            length,
            looped: false,
        });
        connected.insert(to.id.clone());
        *degrees.get_mut(&from.id).expect("known road node") += 1;
        *degrees.get_mut(&to.id).expect("known road node") += 1;
    }

    let existing = edges.iter().map(|edge| edge.id.clone()).collect::<BTreeSet<_>>();
    let mut candidates = Vec::new();
    for (index, from) in ordered.iter().enumerate() {
        for to in &ordered[index + 1..] {
            let id = edge_id(from, to);
            if !existing.contains(&id) {
                candidates.push((from.clone(), to.clone(), distance(from, to), id));
            }
        }
    }
    candidates.sort_by(|left, right| left.2.total_cmp(&right.2).then_with(|| left.3.cmp(&right.3)));
    let loop_budget = (ordered.len() / 4).max(1);
    for (from, to, length, id) in candidates {
        if edges.iter().filter(|edge| edge.looped).count() >= loop_budget {
            break;
        }
        if degrees[&from.id] >= from.degree_limit || degrees[&to.id] >= to.degree_limit {
            continue;
        }
        let mean = edges.iter().map(|edge| edge.length).sum::<f64>() / edges.len().max(1) as f64;
        if length > 256.0_f64.max(mean * 1.45) {
            continue;
        }
        edges.push(RoadEdge {
            id,
            from: from.clone(),
            to: to.clone(),
            length,
            looped: true,
        });
        *degrees.get_mut(&from.id).expect("known road node") += 1;
        *degrees.get_mut(&to.id).expect("known road node") += 1;
    }
    edges
}

#[derive(Clone)]
struct SearchNode {
    key: String,
    x: i32,
    z: i32,
    g: f64,
    f: f64,
    parent: Option<String>,
}

fn coordinate_key(x: i32, z: i32) -> String {
    format!("{x},{z}")
}

fn js_round(value: f64) -> i32 {
    (value + 0.5).floor() as i32
}

pub(crate) fn terrain_following(
    from: (i32, i32),
    to: (i32, i32),
    sample: impl Fn(i32, i32) -> RoadSample,
    grid: i32,
) -> Vec<RoadPoint> {
    let step = grid.clamp(2, 8);
    let sx = js_round(f64::from(from.0) / f64::from(step)) * step;
    let sz = js_round(f64::from(from.1) / f64::from(step)) * step;
    let tx = js_round(f64::from(to.0) / f64::from(step)) * step;
    let tz = js_round(f64::from(to.1) / f64::from(step)) * step;
    let route_length = f64::from(tx - sx).hypot(f64::from(tz - sz));
    let padding = 128.0_f64.min(48.0_f64.max(route_length * 0.18));
    let min_x = f64::from(sx.min(tx)) - padding;
    let max_x = f64::from(sx.max(tx)) + padding;
    let min_z = f64::from(sz.min(tz)) - padding;
    let max_z = f64::from(sz.max(tz)) + padding;
    let start = SearchNode {
        key: coordinate_key(sx, sz),
        x: sx,
        z: sz,
        g: 0.0,
        f: route_length,
        parent: None,
    };
    let mut open = BTreeMap::from([(start.key.clone(), start.clone())]);
    let mut closed = BTreeMap::<String, SearchNode>::new();
    let directions = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)];
    let mut goal = None;
    let mut expansions = 0;
    while !open.is_empty() && expansions < 32_000 {
        let current_key = open
            .values()
            .min_by(|left, right| left.f.total_cmp(&right.f).then_with(|| left.key.cmp(&right.key)))
            .expect("non-empty road search")
            .key
            .clone();
        let current = open.remove(&current_key).expect("selected road search node");
        closed.insert(current.key.clone(), current.clone());
        expansions += 1;
        if f64::from(current.x - tx).hypot(f64::from(current.z - tz)) <= f64::from(step) * 1.5 {
            goal = Some(current);
            break;
        }
        let current_sample = sample(current.x, current.z);
        for (dx, dz) in directions {
            let x = current.x + dx * step;
            let z = current.z + dz * step;
            if f64::from(x) < min_x || f64::from(x) > max_x || f64::from(z) < min_z || f64::from(z) > max_z {
                continue;
            }
            let id = coordinate_key(x, z);
            if closed.contains_key(&id) {
                continue;
            }
            let next = sample(x, z);
            if next.forbidden {
                continue;
            }
            let diagonal = if dx != 0 && dz != 0 {
                std::f64::consts::SQRT_2
            } else {
                1.0
            };
            let rise = f64::from((next.height - current_sample.height).abs());
            let water_cost = if next.water { 4.5 } else { 0.0 };
            let slope_cost = rise * rise * 1.65 + next.slope_risk.max(0.0) * 5.0;
            let turn_cost = if current.parent.is_some() { 0.12 } else { 0.0 };
            let g = current.g + f64::from(step) * diagonal + water_cost + slope_cost + turn_cost;
            if open.get(&id).is_some_and(|prior| prior.g <= g) {
                continue;
            }
            open.insert(
                id.clone(),
                SearchNode {
                    key: id,
                    x,
                    z,
                    g,
                    f: g + f64::from(tx - x).hypot(f64::from(tz - z)),
                    parent: Some(current.key.clone()),
                },
            );
        }
    }

    let Some(goal) = goal else {
        let count = js_round(f64::from(to.0 - from.0).hypot(f64::from(to.1 - from.1)).ceil()).max(1);
        let mut fallback = Vec::with_capacity(count as usize + 1);
        for index in 0..=count {
            let t = f64::from(index) / f64::from(count);
            let x = js_round(f64::from(from.0) + f64::from(to.0 - from.0) * t);
            let z = js_round(f64::from(from.1) + f64::from(to.1 - from.1) * t);
            let terrain = sample(x, z);
            if terrain.forbidden {
                return Vec::new();
            }
            fallback.push(RoadPoint {
                x,
                y: if terrain.water {
                    terrain.waterline + 1
                } else {
                    terrain.height
                },
                z,
                kind: if terrain.water {
                    RoadPointKind::Bridge
                } else {
                    RoadPointKind::Road
                },
                grade: 0,
            });
        }
        return fallback;
    };

    let mut coarse = Vec::new();
    let mut cursor = Some(goal.clone());
    while let Some(node) = cursor {
        cursor = node
            .parent
            .as_ref()
            .and_then(|parent| closed.get(parent).or_else(|| open.get(parent)))
            .cloned();
        coarse.push(node);
    }
    coarse.reverse();
    coarse.insert(0, start.clone());
    coarse.push(SearchNode {
        key: coordinate_key(tx, tz),
        x: tx,
        z: tz,
        g: goal.g,
        f: goal.f,
        parent: Some(goal.key),
    });
    let mut points = Vec::new();
    let mut prior_y = sample(from.0, from.1).height;
    let mut consecutive_water = 0;
    for segment in 0..coarse.len() - 1 {
        let a = &coarse[segment];
        let b = &coarse[segment + 1];
        let count = js_round(f64::from(b.x - a.x).hypot(f64::from(b.z - a.z)).ceil()).max(1);
        for index in if segment == 0 { 0 } else { 1 }..=count {
            let t = f64::from(index) / f64::from(count);
            let x = js_round(f64::from(a.x) + f64::from(b.x - a.x) * t);
            let z = js_round(f64::from(a.z) + f64::from(b.z - a.z) * t);
            let terrain = sample(x, z);
            let target_y = if terrain.water {
                terrain.waterline + 1
            } else {
                terrain.height
            };
            let y = if (target_y - prior_y).abs() > 1 {
                prior_y + (target_y - prior_y).signum()
            } else {
                target_y
            };
            let grade = y - prior_y;
            consecutive_water = if terrain.water { consecutive_water + 1 } else { 0 };
            let kind = if terrain.water {
                if consecutive_water > 28 {
                    RoadPointKind::Ferry
                } else if consecutive_water > 8 {
                    RoadPointKind::Causeway
                } else {
                    RoadPointKind::Bridge
                }
            } else if (target_y - y).abs() > 1 {
                RoadPointKind::Switchback
            } else {
                RoadPointKind::Road
            };
            points.push(RoadPoint { x, y, z, kind, grade });
            prior_y = y;
        }
    }
    let mut unique = Vec::new();
    for point in points {
        if unique
            .last()
            .is_none_or(|prior: &RoadPoint| prior.x != point.x || prior.z != point.z)
        {
            unique.push(point);
        }
    }
    let mut previous_y = unique.first().map_or(sample(from.0, from.1).height, |point| point.y);
    for (index, point) in unique.iter_mut().enumerate() {
        let y = if index == 0 || (point.y - previous_y).abs() <= 1 {
            point.y
        } else {
            previous_y + (point.y - previous_y).signum()
        };
        point.y = y;
        point.grade = if index == 0 { 0 } else { y - previous_y };
        previous_y = y;
    }
    unique
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn road_graph_and_path_are_deterministic_and_contiguous() {
        let nodes = vec![
            RoadNode {
                id: "a".into(),
                x: -30,
                z: 0,
                payload: 1,
                degree_limit: 2,
            },
            RoadNode {
                id: "b".into(),
                x: 30,
                z: 0,
                payload: 2,
                degree_limit: 2,
            },
            RoadNode {
                id: "c".into(),
                x: 0,
                z: 40,
                payload: 3,
                degree_limit: 2,
            },
        ];
        assert_eq!(
            regional_graph(&nodes)
                .iter()
                .map(|edge| edge.id.as_str())
                .collect::<Vec<_>>(),
            vec!["a<->c", "b<->c", "a<->b"]
        );
        let sample = |x: i32, z: i32| RoadSample {
            height: (x.abs() + z.abs()) / 24,
            waterline: 0,
            water: false,
            forbidden: false,
            slope_risk: 0.0,
        };
        let first = terrain_following((-30, 0), (30, 0), sample, 4);
        let second = terrain_following((-30, 0), (30, 0), sample, 4);
        assert_eq!(first, second);
        assert!(first.windows(2).all(|pair| {
            (pair[1].x - pair[0].x).abs() <= 1
                && (pair[1].z - pair[0].z).abs() <= 1
                && (pair[1].y - pair[0].y).abs() <= 1
        }));
    }
}
