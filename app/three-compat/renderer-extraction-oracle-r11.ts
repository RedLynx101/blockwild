import * as THREE from "three";
import {
  BLOCK_ATLAS_TEXTURE_ID_V2,
  type RenderEnvironmentV2,
  type RenderFrameV2,
  type RenderGeometryV2,
  type RenderInstanceV2,
  type RenderMaterialV2,
  type RenderParticleV2,
  type RenderPointLightV2,
  type RenderResourceBatchV2,
  type RenderTextureV2,
} from "../game/rust-render-extraction-v2.ts";

const VERTEX_SHADER = `
attribute vec4 voxelLight;
attribute float voxelEmission;
attribute float voxelOcclusion;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vColor;
varying vec4 vLight;
varying float vEmission;
varying float vOcclusion;
varying vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vColor = vec4(color, 1.0);
  vLight = voxelLight;
  vEmission = voxelEmission;
  vOcclusion = voxelOcclusion;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec4 baseColor;
uniform vec3 emissiveColor;
uniform float emissiveStrength;
uniform float roughness;
uniform float metalness;
uniform float alphaCutoff;
uniform float shading;
uniform float blendMode;
uniform float atlasTile;
uniform bool hasAtlas;
uniform sampler2D atlasTexture;
uniform vec4 tint;
uniform vec3 cameraWorldPosition;
uniform vec3 ambientColor;
uniform float ambientIntensity;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float sunIntensity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float blockIntensity;
uniform float minimumAmbient;
uniform float waterPhase;
uniform vec3 heldPosition;
uniform vec3 heldColor;
uniform float heldIntensity;
uniform float heldRadius;
uniform vec3 machinePosition;
uniform vec3 machineColor;
uniform float machineIntensity;
uniform float machineRadius;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vColor;
varying vec4 vLight;
varying float vEmission;
varying float vOcclusion;
varying vec2 vUv;
void main() {
  vec4 atlasColor = vec4(1.0);
  float atlasTone = 1.0;
  if (atlasTile >= 0.0 && hasAtlas) {
    vec2 sampleUv = vUv;
    if (blendMode > 3.5) {
      vec2 tile = floor(sampleUv * 16.0);
      vec2 localUv = fract(sampleUv * 16.0);
      localUv.x = fract(localUv.x + waterPhase);
      localUv = clamp(localUv, vec2(0.014), vec2(0.986));
      sampleUv = (tile + localUv) / 16.0;
    }
    atlasColor = texture2D(atlasTexture, sampleUv);
  } else if (atlasTile >= 0.0) {
    vec2 atlasCell = floor(vUv * 16.0);
    float noise = fract(sin(dot(atlasCell + vec2(atlasTile, atlasTile * 0.37), vec2(12.9898, 78.233))) * 43758.5453);
    atlasTone = mix(0.90, 1.08, noise);
  }
  vec4 base = baseColor * vColor * tint * atlasColor;
  if (hasAtlas) base.rgb *= 1.1;
  base.rgb *= atlasTone;
  if (base.a < alphaCutoff) discard;
  vec3 normalDirection = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraWorldPosition - vWorldPosition);
  vec3 normalizedSun = normalize(sunDirection);
  float diffuse = max(dot(normalDirection, normalizedSun), 0.0);
  float sky = pow(clamp(vLight.x, 0.0, 1.0), 1.22);
  vec3 blockLight = pow(clamp(vLight.yzw, 0.0, 1.0), vec3(1.32)) * blockIntensity;
  vec3 lit = vec3(minimumAmbient) + ambientColor * sky * ambientIntensity + sunColor * sunIntensity * diffuse * sky + blockLight;
  vec3 heldDelta = heldPosition - vWorldPosition;
  float heldDistance = length(heldDelta);
  float heldAttenuation = heldRadius > 0.0 ? pow(clamp(1.0 - heldDistance / heldRadius, 0.0, 1.0), 1.45) : 0.0;
  float heldFacing = heldDistance > 0.0001 ? max(dot(normalDirection, heldDelta / heldDistance), 0.0) : 1.0;
  lit += heldColor * heldIntensity * heldAttenuation * (0.16 + heldFacing * 0.84);
  vec3 machineDelta = machinePosition - vWorldPosition;
  float machineDistance = length(machineDelta);
  float machineAttenuation = machineRadius > 0.0 ? pow(clamp(1.0 - machineDistance / machineRadius, 0.0, 1.0), 1.7) : 0.0;
  float machineFacing = machineDistance > 0.0001 ? max(dot(normalDirection, machineDelta / machineDistance), 0.0) : 1.0;
  lit += machineColor * machineIntensity * machineAttenuation * (0.2 + machineFacing * 0.8);
  lit *= vOcclusion;
  if (shading < 0.5 || (shading > 2.5 && shading < 4.5)) lit = vec3(1.0);
  vec3 color = base.rgb * lit + emissiveColor * emissiveStrength + base.rgb * vEmission;
  if (shading > 1.5 && shading < 2.5) {
    vec3 halfway = normalize(normalizedSun + viewDirection);
    float gloss = max(2.0, mix(96.0, 4.0, roughness));
    float specular = pow(max(dot(normalDirection, halfway), 0.0), gloss);
    color += sunColor * specular * mix(0.08, 0.7, metalness);
  }
  float fog = clamp((distance(vWorldPosition, cameraWorldPosition) - fogNear) / max(fogFar - fogNear, 0.001), 0.0, 1.0);
  gl_FragColor = vec4(mix(color, fogColor, fog), base.a);
  #include <colorspace_fragment>
}`;

type OracleUniforms = Readonly<Record<string, THREE.IUniform>>;

export class ThreeExtractionOracleR11 {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly geometries = new Map<bigint, THREE.BufferGeometry>();
  private readonly materialRecords = new Map<bigint, RenderMaterialV2>();
  private readonly materials = new Map<bigint, THREE.ShaderMaterial>();
  private readonly textures = new Map<bigint, THREE.DataTexture>();
  private readonly objects = new Map<bigint, THREE.Mesh>();
  private readonly particleObjects = new Map<bigint, THREE.Mesh>();
  private particleGeometry: THREE.BufferGeometry | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  applyResources(batch: RenderResourceBatchV2) {
    for (const operation of batch.operations) {
      if (operation.kind === "upsert-geometry") this.upsertGeometry(operation.geometry);
      else if (operation.kind === "remove-geometry") this.removeGeometry(operation.id);
      else if (operation.kind === "upsert-material") this.upsertMaterial(operation.material);
      else if (operation.kind === "remove-material") this.removeMaterial(operation.id);
      else if (operation.kind === "upsert-texture") this.upsertTexture(operation.texture);
      else this.removeTexture(operation.id);
    }
  }

  resize(width: number, height: number) {
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
  }

  render(frame: RenderFrameV2) {
    this.camera.position.fromArray(frame.camera.position);
    this.camera.quaternion.fromArray(frame.camera.orientation);
    this.camera.fov = THREE.MathUtils.radToDeg(frame.camera.verticalFovRadians);
    this.camera.near = frame.camera.near;
    this.camera.far = frame.camera.far;
    this.camera.aspect = frame.camera.viewport[0] / frame.camera.viewport[1];
    this.camera.updateProjectionMatrix();
    this.resize(frame.camera.viewport[0], frame.camera.viewport[1]);
    this.updateEnvironment(frame.environment);
    this.syncInstances(frame);
    this.syncParticles(frame.particles);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.particleGeometry?.dispose();
    this.renderer.dispose();
    for (const object of this.objects.values()) object.removeFromParent();
    for (const object of this.particleObjects.values()) object.removeFromParent();
    this.geometries.clear(); this.materials.clear(); this.materialRecords.clear(); this.textures.clear(); this.objects.clear(); this.particleObjects.clear();
  }

  private upsertGeometry(source: RenderGeometryV2) {
    this.removeGeometry(source.id);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.positions.slice(), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(source.normals.slice(), 3, true));
    geometry.setAttribute("color", new THREE.BufferAttribute(source.colors.length ? source.colors.slice() : new Uint8Array(source.positions.length).fill(255), 3, true));
    const vertices = source.positions.length / 3;
    geometry.setAttribute("voxelLight", new THREE.BufferAttribute(source.lights.length ? source.lights.slice() : new Uint8Array(vertices * 4).fill(255), 4, true));
    geometry.setAttribute("voxelEmission", new THREE.BufferAttribute(source.emissions.length ? source.emissions.slice() : new Uint8Array(vertices), 1, true));
    geometry.setAttribute("voxelOcclusion", new THREE.BufferAttribute(source.occlusions.length ? source.occlusions.slice() : new Uint8Array(vertices).fill(255), 1, true));
    geometry.setAttribute("uv", new THREE.BufferAttribute(source.uvs.length ? source.uvs.slice() : new Uint16Array(vertices * 2), 2, true));
    geometry.setIndex(new THREE.BufferAttribute(source.indices.slice(), 1));
    geometry.computeBoundingSphere();
    this.geometries.set(source.id, geometry);
  }

  private removeGeometry(id: bigint) {
    this.geometries.get(id)?.dispose();
    this.geometries.delete(id);
  }

  private upsertMaterial(source: RenderMaterialV2) {
    this.removeMaterial(source.id);
    this.materialRecords.set(source.id, source);
    this.materials.set(source.id, this.createMaterial(source));
  }

  private removeMaterial(id: bigint) {
    this.materials.get(id)?.dispose();
    this.materials.delete(id); this.materialRecords.delete(id);
  }

  private upsertTexture(source: RenderTextureV2) {
    this.removeTexture(source.id);
    const texture = new THREE.DataTexture(source.rgba8.slice(), source.width, source.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.colorSpace = source.colorSpace === 1 ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    texture.magFilter = source.filter === 0 ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = source.filter === 0 ? THREE.NearestFilter : THREE.LinearFilter;
    texture.flipY = true;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.textures.set(source.id, texture);
    this.refreshAtlasBindings();
  }

  private removeTexture(id: bigint) {
    this.textures.get(id)?.dispose();
    this.textures.delete(id);
    this.refreshAtlasBindings();
  }

  private createMaterial(source: RenderMaterialV2) {
    const uniforms: OracleUniforms = {
      baseColor: { value: new THREE.Vector4(...source.baseColorRgba8.map((value) => value / 255) as [number, number, number, number]) },
      emissiveColor: { value: new THREE.Color().setRGB(...source.emissiveRgb8.map((value) => value / 255) as [number, number, number]) },
      emissiveStrength: { value: source.emissiveStrength }, roughness: { value: source.roughness }, metalness: { value: source.metalness },
      alphaCutoff: { value: source.alphaCutoff }, shading: { value: source.shading }, blendMode: { value: source.blend },
      atlasTile: { value: source.atlasTile ?? -1 }, hasAtlas: { value: false }, atlasTexture: { value: null }, tint: { value: new THREE.Vector4(1, 1, 1, 1) },
      cameraWorldPosition: { value: new THREE.Vector3() }, ambientColor: { value: new THREE.Color() }, ambientIntensity: { value: 1 },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color(1, 1, 1) }, sunIntensity: { value: 0 },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 0 }, fogFar: { value: 1 }, blockIntensity: { value: 1.35 }, minimumAmbient: { value: 0.026 }, waterPhase: { value: 0 },
      heldPosition: { value: new THREE.Vector3() }, heldColor: { value: new THREE.Color() }, heldIntensity: { value: 0 }, heldRadius: { value: 0 },
      machinePosition: { value: new THREE.Vector3() }, machineColor: { value: new THREE.Color() }, machineIntensity: { value: 0 }, machineRadius: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER, vertexColors: true,
      transparent: source.blend === 2 || source.blend === 3 || source.blend === 4,
      blending: source.blend === 3 ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: source.depthWrite,
      side: source.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      fog: false,
    });
    this.bindAtlas(material);
    return material;
  }

  private refreshAtlasBindings() { for (const material of this.materials.values()) this.bindAtlas(material); }
  private bindAtlas(material: THREE.ShaderMaterial) {
    const atlas = this.textures.get(BLOCK_ATLAS_TEXTURE_ID_V2) ?? null;
    material.uniforms.atlasTexture.value = atlas;
    material.uniforms.hasAtlas.value = Boolean(atlas);
  }

  private updateEnvironment(environment: RenderEnvironmentV2) {
    // Extraction colors are authored as shader-linear bytes. Both the wgpu
    // sRGB surface view and Three's sRGB output transform encode them once.
    const clear = new THREE.Color().setRGB(environment.clearRgba8[0] / 255, environment.clearRgba8[1] / 255, environment.clearRgba8[2] / 255);
    this.renderer.setClearColor(clear, environment.clearRgba8[3] / 255);
    for (const material of this.materials.values()) {
      const uniforms = material.uniforms;
      uniforms.cameraWorldPosition.value.copy(this.camera.position);
      setLinearRgb(uniforms.ambientColor.value, environment.ambientRgb8); uniforms.ambientIntensity.value = environment.ambientIntensity;
      uniforms.sunDirection.value.fromArray(environment.sunDirection).normalize(); setLinearRgb(uniforms.sunColor.value, environment.sunRgb8); uniforms.sunIntensity.value = environment.sunIntensity;
      setLinearRgb(uniforms.fogColor.value, environment.fogRgb8); uniforms.fogNear.value = environment.fogNear; uniforms.fogFar.value = environment.fogFar;
      const lighting = environment.lighting;
      uniforms.blockIntensity.value = lighting?.blockIntensity ?? 1.35;
      uniforms.minimumAmbient.value = lighting?.minimumAmbient ?? (environment.underwater > .5 ? .035 : .026);
      uniforms.waterPhase.value = lighting?.waterPhase ?? 0;
      updatePointLight(uniforms, "held", lighting?.held);
      updatePointLight(uniforms, "machine", lighting?.machine);
    }
  }

  private syncInstances(frame: RenderFrameV2) {
    const alive = new Set<bigint>();
    for (const instance of frame.instances) {
      alive.add(instance.stableId);
      const geometry = this.geometries.get(instance.geometry);
      const material = this.materials.get(instance.material);
      if (!geometry || !material) continue;
      let mesh = this.objects.get(instance.stableId);
      if (!mesh || mesh.geometry !== geometry || mesh.material !== material) {
        if (mesh) mesh.removeFromParent();
        mesh = new THREE.Mesh(geometry, material);
        this.objects.set(instance.stableId, mesh);
      }
      applyAnimatedTransform(mesh, instance, frame.animationTimeMicros);
      mesh.visible = instance.visibilityMask !== 0;
      mesh.renderOrder = instance.sortKey;
      const tint = instance.tintRgba8;
      mesh.onBeforeRender = () => material.uniforms.tint.value.set(tint[0] / 255, tint[1] / 255, tint[2] / 255, tint[3] / 255);
      this.scene.add(mesh);
    }
    for (const instance of frame.instances) {
      if (instance.parent === null) continue;
      const child = this.objects.get(instance.stableId), parent = this.objects.get(instance.parent);
      if (child && parent) parent.add(child);
    }
    for (const [id, object] of this.objects) if (!alive.has(id)) { object.removeFromParent(); this.objects.delete(id); }
  }

  private syncParticles(particles: readonly RenderParticleV2[]) {
    const alive = new Set<bigint>();
    const geometry = this.particleGeometry ??= createParticleGeometry();
    for (const particle of particles) {
      const material = this.materials.get(particle.material);
      if (!material) continue;
      alive.add(particle.stableId);
      let mesh = this.particleObjects.get(particle.stableId);
      if (!mesh || mesh.material !== material) {
        mesh?.removeFromParent();
        mesh = new THREE.Mesh(geometry, material);
        this.particleObjects.set(particle.stableId, mesh);
      }
      const halfAngle = particle.rotation * .5;
      mesh.position.fromArray(particle.position);
      mesh.quaternion.set(0, Math.sin(halfAngle), 0, Math.cos(halfAngle));
      mesh.scale.setScalar(particle.size);
      mesh.renderOrder = 2_147_483_647;
      const life = Math.max(0, Math.min(1, 1 - particle.ageSeconds / particle.lifetimeSeconds));
      const tint = particle.colorRgba8;
      mesh.onBeforeRender = () => material.uniforms.tint.value.set(tint[0] / 255, tint[1] / 255, tint[2] / 255, tint[3] / 255 * life * life);
      this.scene.add(mesh);
    }
    for (const [id, object] of this.particleObjects) if (!alive.has(id)) { object.removeFromParent(); this.particleObjects.delete(id); }
  }
}

function setLinearRgb(color: THREE.Color, rgb: readonly [number, number, number]) { color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255); }

function updatePointLight(uniforms: Record<string, THREE.IUniform>, prefix: "held" | "machine", light: RenderPointLightV2 | undefined) {
  uniforms[`${prefix}Position`].value.fromArray(light?.position ?? [0, 0, 0]);
  setLinearRgb(uniforms[`${prefix}Color`].value, light?.colorRgb8 ?? [0, 0, 0]);
  uniforms[`${prefix}Intensity`].value = light?.intensity ?? 0;
  uniforms[`${prefix}Radius`].value = light?.radius ?? 0;
}

function createParticleGeometry() {
  const faces = [
    [[1, 0, 0], [[.5, -.5, -.5], [.5, -.5, .5], [.5, .5, .5], [.5, .5, -.5]]],
    [[-1, 0, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [-.5, .5, -.5], [-.5, .5, .5]]],
    [[0, 1, 0], [[-.5, .5, -.5], [.5, .5, -.5], [.5, .5, .5], [-.5, .5, .5]]],
    [[0, -1, 0], [[-.5, -.5, .5], [.5, -.5, .5], [.5, -.5, -.5], [-.5, -.5, -.5]]],
    [[0, 0, 1], [[.5, -.5, .5], [-.5, -.5, .5], [-.5, .5, .5], [.5, .5, .5]]],
    [[0, 0, -1], [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5]]],
  ] as const;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  faces.forEach(([normal, corners], face) => {
    const base = face * 4;
    corners.forEach((position, corner) => {
      positions.push(...position); normals.push(...normal);
      uvs.push(...([[0, 0], [1, 0], [1, 1], [0, 1]] as const)[corner]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Array(24 * 3).fill(1), 3));
  geometry.setAttribute("voxelLight", new THREE.Float32BufferAttribute(Array.from({ length: 24 }, () => [1, 0, 0, 0]).flat(), 4));
  geometry.setAttribute("voxelEmission", new THREE.Float32BufferAttribute(new Array(24).fill(0), 1));
  geometry.setAttribute("voxelOcclusion", new THREE.Float32BufferAttribute(new Array(24).fill(1), 1));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function applyAnimatedTransform(object: THREE.Object3D, instance: RenderInstanceV2, animationTimeMicros: bigint) {
  const translation = [...instance.transform.translation] as [number, number, number];
  const rotation = new THREE.Quaternion(...instance.transform.rotation);
  const scale = [...instance.transform.scale] as [number, number, number];
  const seconds = Number(animationTimeMicros) / 1_000_000;
  const stablePhase = Number((instance.stableId * BigInt(2_654_435_761)) & BigInt(0xffff)) / 65_535 * Math.PI * 2;
  if (instance.animationFlags & 1) translation[1] += Math.sin(seconds * 2.1 + stablePhase) * .075;
  if (instance.animationFlags & 2) rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), seconds * .85 + stablePhase));
  if (instance.animationFlags & 4) rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(seconds * 7.5 + stablePhase) * .48 * (instance.stableId & BigInt(1) ? -1 : 1)));
  if (instance.animationFlags & 8) rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(seconds * 1.35 + stablePhase) * .11));
  if (instance.animationFlags & 16) { const pulse = 1 + Math.sin(seconds * 2.8 + stablePhase) * .045; scale[0] *= pulse; scale[1] *= pulse; scale[2] *= pulse; }
  object.position.fromArray(translation); object.quaternion.copy(rotation); object.scale.fromArray(scale);
}
