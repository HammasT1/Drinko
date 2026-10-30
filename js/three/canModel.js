/**
 * The 3D can: procedural (lathe geometry) or a .glb from config.js.
 * ---------------------------------------------------------------------------
 * Both paths return the same shape of object, so hero3d.js never cares:
 *   { root, labelMaterial, tabPivot, height, radius, opening, morph }
 *
 * Units: the can is ~1.02 tall with its base at y = 0 (before centering).
 */
import * as THREE from 'three';

export const CAN = {
  radius: 0.3,
  bodyBottom: 0.075,
  bodyTop: 0.86,
  height: 1.02,
};

/**
 * Label material with a "liquid fill" morph between two label textures.
 * morph.uniforms.uMix: 0 = current map, 1 = next map (rises from the bottom
 * with a wobbling meniscus line).
 */
function createLabelMaterial({ map, bumpMap, roughnessMap }) {
  const material = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap,
    bumpScale: 1.4,
    roughnessMap,
    roughness: 1, // scaled by roughnessMap
    metalness: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.25,
  });

  const morph = {
    uniforms: {
      uMapNext: { value: map },
      uMix: { value: 0 },
      uTime: { value: 0 },
    },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, morph.uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uMapNext;
        uniform float uMix;
        uniform float uTime;`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 labelA = texture2D( map, vMapUv );
          vec4 labelB = texture2D( uMapNext, vMapUv );
          float wobble = sin( vMapUv.x * 37.7 + uTime * 6.0 ) * 0.018 + sin( vMapUv.x * 12.6 - uTime * 3.1 ) * 0.025;
          float level = uMix * 1.25 - 0.12 + wobble;
          float filled = 1.0 - smoothstep( level - 0.015, level, vMapUv.y );
          vec4 label = mix( labelA, labelB, filled );
          float meniscus = ( 1.0 - smoothstep( 0.0, 0.014, abs( vMapUv.y - level ) ) ) * step( 0.001, uMix ) * step( uMix, 0.999 );
          label.rgb += meniscus * 0.55;
          diffuseColor *= label;
        #endif`);
  };
  // Make sure our patched program isn't shared with unpatched physical materials.
  material.customProgramCacheKey = () => 'drinko-label';
  return { material, morph };
}

function metalMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xdfe3e9,
    metalness: 1,
    roughness: 0.24,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });
}

/** Rounded pull tab with a finger hole, lying flat (ring end toward the back). */
function createTab(material) {
  const shape = new THREE.Shape();
  const w = 0.075; // half width
  const nose = -0.05;
  const tail = 0.19;
  const r = 0.05;
  shape.moveTo(-w + r, nose);
  shape.lineTo(w - r, nose);
  shape.quadraticCurveTo(w, nose, w, nose + r);
  shape.lineTo(w, tail - r);
  shape.quadraticCurveTo(w, tail, w - r, tail);
  shape.lineTo(-w + r, tail);
  shape.quadraticCurveTo(-w, tail, -w, tail - r);
  shape.lineTo(-w, nose + r);
  shape.quadraticCurveTo(-w, nose, -w + r, nose);

  const hole = new THREE.Path();
  hole.absellipse(0, 0.115, 0.045, 0.045, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.006,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geometry.rotateX(-Math.PI / 2); // shape +y -> world -z, extrusion -> up
  const tab = new THREE.Mesh(geometry, material);
  tab.castShadow = true;
  return tab;
}

export function buildProceduralCan(textures) {
  const { radius: R, bodyBottom, bodyTop } = CAN;
  const root = new THREE.Group();
  const metal = metalMaterial();
  const { material: labelMaterial, morph } = createLabelMaterial(textures);

  // Body (printed label). thetaStart = -PI puts u = 0.5 at the front (+z).
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, bodyTop - bodyBottom, 128, 1, true, -Math.PI, Math.PI * 2),
    labelMaterial,
  );
  body.position.y = (bodyTop + bodyBottom) / 2;

  // Domed base + foot ring
  const bottom = new THREE.Mesh(new THREE.LatheGeometry([
    [0, 0.035], [0.12, 0.03], [0.2, 0.012], [0.235, 0], [0.255, 0.004],
    [0.275, 0.022], [0.292, 0.05], [R, bodyBottom],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 128), metal);

  // Shoulder, neck, rolled rim and recessed lid
  const top = new THREE.Mesh(new THREE.LatheGeometry([
    [R, bodyTop], [0.298, 0.88], [0.285, 0.91], [0.262, 0.955], [0.252, 0.98],
    [0.252, 0.99], [0.258, 0.998], [0.261, 1.006], [0.256, 1.014], [0.246, 1.013],
    [0.243, 1.0], [0.236, 0.99], [0.23, 0.985], [0.001, 0.985],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 128), metal);

  // Score line around the drinking opening + rivet
  const score = new THREE.Mesh(
    new THREE.TorusGeometry(0.065, 0.0035, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x8a919c, metalness: 1, roughness: 0.4 }),
  );
  score.rotation.x = Math.PI / 2;
  score.scale.set(1, 0.72, 1);
  score.position.set(0, 0.986, 0.13);
  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.01, 24), metal);
  rivet.position.set(0, 0.99, 0.03);

  // Tab on a pivot at the rivet so it can pop up
  const tabPivot = new THREE.Group();
  tabPivot.position.set(0, 0.992, 0.03);
  tabPivot.add(createTab(metal));

  [body, bottom, top].forEach((mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; });
  root.add(body, bottom, top, score, rivet, tabPivot);

  return {
    root,
    labelMaterial,
    morph,
    tabPivot,
    height: CAN.height,
    radius: R,
    labelRange: [bodyBottom, bodyTop],
    opening: new THREE.Vector3(0, 0.995, 0.13), // where liquid erupts (local, base at y=0)
    parts: { body, bottom, top, score, rivet, tabPivot }, // separate meshes (exploded view)
  };
}

/**
 * Load a .glb. Conventions (see README):
 *   - the mesh/material named like "label" gets the generated label texture
 *   - an object named like "tab" pops on tap (rotates around its own origin)
 */
export async function loadModelCan(src, textures) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(src);
  const model = gltf.scene;
  const { material: labelMaterial, morph } = createLabelMaterial(textures);

  let tabPivot = null;
  let labelFound = false;
  model.traverse((node) => {
    if (/tab/i.test(node.name) && !tabPivot) tabPivot = node;
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (/label/i.test(node.name) || /label/i.test(node.material?.name || '')) {
      node.material = labelMaterial;
      labelFound = true;
    }
  });
  if (!labelFound) console.warn('[Drinko] No mesh/material named "label" in the .glb; flavor labels will not show.');

  // Normalize: base at y = 0, height = CAN.height, centered on x/z.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = CAN.height / size.y;
  model.scale.setScalar(scale);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const root = new THREE.Group();
  root.add(model);
  const radius = (size.x * scale) / 2;
  return {
    root,
    labelMaterial,
    morph,
    tabPivot: tabPivot || new THREE.Group(),
    height: CAN.height,
    radius,
    labelRange: [CAN.height * 0.08, CAN.height * 0.84],
    opening: new THREE.Vector3(0, CAN.height * 0.98, radius * 0.4),
  };
}
