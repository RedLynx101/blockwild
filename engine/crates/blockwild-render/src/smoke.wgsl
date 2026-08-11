struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
};

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.72),
        vec2<f32>(-0.68, -0.55),
        vec2<f32>(0.68, -0.55),
    );
    var colors = array<vec3<f32>, 3>(
        vec3<f32>(0.94, 0.67, 0.20),
        vec3<f32>(0.22, 0.62, 0.36),
        vec3<f32>(0.24, 0.48, 0.72),
    );
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.color = colors[vertex_index];
    return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, 1.0);
}

