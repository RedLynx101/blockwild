struct CameraUniform {
    view_projection: mat4x4<f32>,
    camera_position: vec4<f32>,
    ambient: vec4<f32>,
    sun_direction_intensity: vec4<f32>,
    sun_color: vec4<f32>,
    fog_color_near: vec4<f32>,
    fog_far_underwater_cave: vec4<f32>,
};

struct MaterialUniform {
    base_color: vec4<f32>,
    emissive_strength: vec4<f32>,
    surface: vec4<f32>,
    render_flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(1) @binding(0) var<uniform> material: MaterialUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) light: vec4<f32>,
    @location(4) emission: f32,
    @location(5) uv: vec2<f32>,
    @location(6) model_0: vec4<f32>,
    @location(7) model_1: vec4<f32>,
    @location(8) model_2: vec4<f32>,
    @location(9) model_3: vec4<f32>,
    @location(10) tint: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) light: vec4<f32>,
    @location(4) emission: f32,
    @location(5) uv: vec2<f32>,
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
    return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let shading = u32(round(material.surface.w));
    let blend = u32(round(material.render_flags.x));
    let atlas_tile = material.render_flags.y;
    var atlas_tone = 1.0;
    if (atlas_tile >= 0.0) {
        let atlas_cell = floor(input.uv * 16.0);
        let noise = fract(sin(dot(atlas_cell + vec2<f32>(atlas_tile, atlas_tile * 0.37), vec2<f32>(12.9898, 78.233))) * 43758.5453);
        atlas_tone = mix(0.90, 1.08, noise);
    }
    var base = material.base_color * input.color;
    base = vec4<f32>(base.rgb * atlas_tone, base.a);
    if (base.a < material.surface.z) {
        discard;
    }
    let sun_direction = normalize(-camera.sun_direction_intensity.xyz);
    let normal = normalize(input.world_normal);
    let view_direction = normalize(camera.camera_position.xyz - input.world_position);
    let diffuse = max(dot(normal, sun_direction), 0.0);
    let cave_light = 1.0 - camera.fog_far_underwater_cave.z * 0.82;
    let ambient = camera.ambient.rgb * camera.ambient.a * cave_light;
    let sun = camera.sun_color.rgb * camera.sun_direction_intensity.w * diffuse;
    let sky = input.light.x;
    let block_light = input.light.yzw;
    var lit = ambient * (0.35 + sky * 0.65) + sun * (0.25 + sky * 0.75) + block_light;
    if (shading == 0u || shading == 3u || shading == 4u) {
        lit = vec3<f32>(1.0);
    }
    let emissive = material.emissive_strength.rgb * (material.emissive_strength.a + input.emission);
    var color = base.rgb * lit + emissive;
    if (shading == 2u) {
        let halfway = normalize(sun_direction + view_direction);
        let gloss = max(2.0, mix(96.0, 4.0, material.surface.x));
        let specular = pow(max(dot(normal, halfway), 0.0), gloss);
        color += camera.sun_color.rgb * specular * mix(0.08, 0.7, material.surface.y);
    }
    if (blend == 4u) {
        let time = camera.fog_far_underwater_cave.w;
        let ripple = sin(input.world_position.x * 2.4 + time * 1.7)
            * cos(input.world_position.z * 2.0 - time * 1.2);
        let fresnel = pow(1.0 - max(dot(normal, view_direction), 0.0), 3.0);
        color = mix(color * (0.92 + ripple * 0.035), camera.fog_color_near.rgb * 1.08, 0.16 + fresnel * 0.34);
    } else if (blend == 2u && shading == 2u) {
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
    let environment_mix = max(camera.fog_far_underwater_cave.y, camera.fog_far_underwater_cave.z * 0.75);
    color = mix(color, camera.fog_color_near.rgb, clamp(fog + environment_mix * 0.35, 0.0, 1.0));
    if (camera.fog_far_underwater_cave.y > 0.0) {
        color = mix(color, camera.fog_color_near.rgb * vec3<f32>(0.70, 0.88, 1.05), camera.fog_far_underwater_cave.y * 0.32);
    }
    return vec4<f32>(color, base.a);
}
