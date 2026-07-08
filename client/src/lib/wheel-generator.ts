import * as THREE from "three";

export type SpokePattern =
  | "straight"
  | "double"
  | "ysplit"
  | "curved"
  | "mesh"
  | "turbine"
  | "split5"
  | "multipiece"
  | "fan"
  | "classic";

export interface WheelParams {
  spokeCount: number;
  spokeWidth: number;
  rimDepth: number;
  hubRadius: number;
  outerRadius: number;
  lipWidth: number;
  spokePattern: SpokePattern;
  dishDepth: number;
  spokeCurvature: number;
  spokeSplitRatio: number;
  lipStepCount: number;
  barrelDepth: number;
  spokeThickness: number;
}

export const DEFAULT_WHEEL_PARAMS: WheelParams = {
  spokeCount: 5,
  spokeWidth: 0.12,
  rimDepth: 0.25,
  hubRadius: 0.18,
  outerRadius: 1.0,
  lipWidth: 0.06,
  spokePattern: "straight",
  dishDepth: 0.15,
  spokeCurvature: 0.0,
  spokeSplitRatio: 0.5,
  lipStepCount: 1,
  barrelDepth: 0.3,
  spokeThickness: 0.04,
};

export const SPOKE_PRESETS: { label: string; pattern: SpokePattern; params: Partial<WheelParams> }[] = [
  { label: "5 branches classiques", pattern: "straight", params: { spokeCount: 5, spokeWidth: 0.14, spokePattern: "straight", dishDepth: 0.12 } },
  { label: "5 branches Y-split", pattern: "ysplit", params: { spokeCount: 5, spokeWidth: 0.10, spokePattern: "ysplit", spokeSplitRatio: 0.45, dishDepth: 0.15 } },
  { label: "6 doubles branches", pattern: "double", params: { spokeCount: 6, spokeWidth: 0.07, spokePattern: "double", dishDepth: 0.10 } },
  { label: "7 branches courbées", pattern: "curved", params: { spokeCount: 7, spokeWidth: 0.09, spokePattern: "curved", spokeCurvature: 0.35, dishDepth: 0.18 } },
  { label: "8 branches turbine", pattern: "turbine", params: { spokeCount: 8, spokeWidth: 0.11, spokePattern: "turbine", spokeCurvature: 0.5, dishDepth: 0.2 } },
  { label: "10 branches fines", pattern: "straight", params: { spokeCount: 10, spokeWidth: 0.06, spokePattern: "straight", dishDepth: 0.08 } },
  { label: "12 branches mesh", pattern: "mesh", params: { spokeCount: 12, spokeWidth: 0.04, spokePattern: "mesh", dishDepth: 0.1 } },
  { label: "5 split sport", pattern: "split5", params: { spokeCount: 5, spokeWidth: 0.08, spokePattern: "split5", dishDepth: 0.22 } },
  { label: "Fan 9 branches", pattern: "fan", params: { spokeCount: 9, spokeWidth: 0.09, spokePattern: "fan", spokeCurvature: 0.2, dishDepth: 0.15 } },
  { label: "Multi-pièces", pattern: "multipiece", params: { spokeCount: 5, spokeWidth: 0.12, spokePattern: "multipiece", lipStepCount: 2, dishDepth: 0.2, barrelDepth: 0.4 } },
  { label: "Classic 5 étoiles", pattern: "classic", params: { spokeCount: 5, spokeWidth: 0.16, spokePattern: "classic", dishDepth: 0.05 } },
  { label: "20 branches multi", pattern: "straight", params: { spokeCount: 20, spokeWidth: 0.025, spokePattern: "straight", dishDepth: 0.06 } },
];

function createRimMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xcccccc,
    metalness: 0.85,
    roughness: 0.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.2,
    name: "rim",
  });
}

function buildRimAndBarrel(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { outerRadius, rimDepth, lipWidth, lipStepCount, barrelDepth } = p;

  const outerLipRadius = outerRadius + rimDepth * 0.3;
  const lipGeo = new THREE.TorusGeometry(outerLipRadius, lipWidth * 0.45, 20, 80);
  const lipMesh = new THREE.Mesh(lipGeo, mat.clone());
  lipMesh.position.z = 0;
  group.add(lipMesh);

  if (lipStepCount >= 2) {
    const stepGeo = new THREE.TorusGeometry(outerLipRadius - lipWidth * 0.3, lipWidth * 0.2, 12, 80);
    const stepMesh = new THREE.Mesh(stepGeo, mat.clone());
    stepMesh.position.z = -0.015;
    group.add(stepMesh);
  }

  const innerLipGeo = new THREE.TorusGeometry(outerRadius - rimDepth * 0.25, lipWidth * 0.3, 14, 80);
  const innerLipMesh = new THREE.Mesh(innerLipGeo, mat.clone());
  innerLipMesh.position.z = 0;
  group.add(innerLipMesh);

  const barrelMat = mat.clone();
  barrelMat.roughness = Math.min(1, mat.roughness + 0.15);

  const segments = 80;
  const barrelPoints: THREE.Vector2[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = outerRadius - rimDepth * 0.15 + t * (rimDepth * 0.05);
    barrelPoints.push(new THREE.Vector2(r, -t * barrelDepth));
  }
  const barrelGeo = new THREE.LatheGeometry(barrelPoints, segments);
  const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
  barrelMesh.rotation.x = Math.PI / 2;
  group.add(barrelMesh);

  const backLipGeo = new THREE.TorusGeometry(outerRadius - rimDepth * 0.1, lipWidth * 0.25, 10, 80);
  const backLipMesh = new THREE.Mesh(backLipGeo, mat.clone());
  backLipMesh.position.z = -barrelDepth;
  group.add(backLipMesh);
}

function buildHub(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { hubRadius, rimDepth, spokeCount, dishDepth } = p;

  const hubPoints: THREE.Vector2[] = [];
  const hubSteps = 6;
  for (let i = 0; i <= hubSteps; i++) {
    const t = i / hubSteps;
    const r = hubRadius * (1 - t * 0.05);
    const z = t * rimDepth * 0.5;
    hubPoints.push(new THREE.Vector2(r, z));
  }
  const hubGeo = new THREE.LatheGeometry(hubPoints, 48);
  const hubMesh = new THREE.Mesh(hubGeo, mat.clone());
  hubMesh.rotation.x = -Math.PI / 2;
  hubMesh.position.z = -dishDepth;
  group.add(hubMesh);

  const capRadius = hubRadius * 0.55;
  const capGeo = new THREE.CylinderGeometry(capRadius, capRadius * 0.9, rimDepth * 0.12, 32);
  capGeo.rotateX(Math.PI / 2);
  const capMesh = new THREE.Mesh(capGeo, mat.clone());
  capMesh.position.z = -dishDepth + rimDepth * 0.08;
  group.add(capMesh);

  const logoGeo = new THREE.CircleGeometry(capRadius * 0.6, 32);
  const logoMat = mat.clone();
  logoMat.roughness = 0.6;
  logoMat.metalness = 0.4;
  const logoMesh = new THREE.Mesh(logoGeo, logoMat);
  logoMesh.position.z = -dishDepth + rimDepth * 0.15;
  group.add(logoMesh);

  const boltCount = Math.min(spokeCount, 5);
  const boltCircleRadius = hubRadius * 0.78;
  for (let i = 0; i < boltCount; i++) {
    const angle = (i / boltCount) * Math.PI * 2;
    const boltOuter = new THREE.CylinderGeometry(hubRadius * 0.07, hubRadius * 0.07, rimDepth * 0.1, 12);
    boltOuter.rotateX(Math.PI / 2);
    const bolt = new THREE.Mesh(boltOuter, mat.clone());
    bolt.position.set(
      Math.cos(angle) * boltCircleRadius,
      Math.sin(angle) * boltCircleRadius,
      -dishDepth + rimDepth * 0.06
    );
    group.add(bolt);

    const nutGeo = new THREE.CylinderGeometry(hubRadius * 0.045, hubRadius * 0.045, rimDepth * 0.04, 6);
    nutGeo.rotateX(Math.PI / 2);
    const nut = new THREE.Mesh(nutGeo, mat.clone());
    nut.position.set(
      Math.cos(angle) * boltCircleRadius,
      Math.sin(angle) * boltCircleRadius,
      -dishDepth + rimDepth * 0.12
    );
    group.add(nut);
  }
}

function createSpokeProfile(width: number, thickness: number): THREE.Shape {
  const hw = width * 0.5;
  const ht = thickness * 0.5;
  const r = Math.min(hw, ht) * 0.3;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -ht);
  shape.lineTo(hw - r, -ht);
  shape.quadraticCurveTo(hw, -ht, hw, -ht + r);
  shape.lineTo(hw, ht - r);
  shape.quadraticCurveTo(hw, ht, hw - r, ht);
  shape.lineTo(-hw + r, ht);
  shape.quadraticCurveTo(-hw, ht, -hw, ht - r);
  shape.lineTo(-hw, -ht + r);
  shape.quadraticCurveTo(-hw, -ht, -hw + r, -ht);
  return shape;
}

function buildStraightSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const profile = createSpokeProfile(spokeWidth, spokeThickness);
    const path = new THREE.LineCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, spokeLength, 0)
    );
    const geo = new THREE.ExtrudeGeometry(profile, {
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 2,
      extrudePath: path,
    });

    const spoke = new THREE.Mesh(geo, mat.clone());
    spoke.position.set(
      Math.cos(angle) * hubRadius,
      Math.sin(angle) * hubRadius,
      -dishDepth
    );
    spoke.rotation.z = angle - Math.PI / 2;

    const dishTiltAngle = Math.atan2(dishDepth, spokeLength);
    spoke.rotation.x = -dishTiltAngle * 0.3;

    group.add(spoke);
  }
}

function buildCurvedSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeCurvature, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const curveAmount = spokeCurvature * spokeLength * 0.4;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const segments = 12;
    const points: THREE.Vector3[] = [];

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const x = Math.sin(t * Math.PI) * curveAmount;
      const y = t * spokeLength;
      const z = t * dishDepth;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const profile = createSpokeProfile(spokeWidth * (1 - 0.2), spokeThickness);
    const geo = new THREE.ExtrudeGeometry(profile, {
      steps: segments,
      bevelEnabled: false,
      extrudePath: curve,
    });

    const spoke = new THREE.Mesh(geo, mat.clone());
    spoke.position.set(
      Math.cos(angle) * hubRadius,
      Math.sin(angle) * hubRadius,
      -dishDepth
    );
    spoke.rotation.z = angle - Math.PI / 2;
    group.add(spoke);
  }
}

function buildYSplitSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeSplitRatio, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const splitPoint = spokeLength * spokeSplitRatio;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const stemWidth = spokeWidth * 1.1;
    const branchWidth = spokeWidth * 0.55;
    const splitAngle = 0.12;

    const stemProfile = createSpokeProfile(stemWidth, spokeThickness);
    const stemPath = new THREE.LineCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, splitPoint, dishDepth * spokeSplitRatio)
    );
    const stemGeo = new THREE.ExtrudeGeometry(stemProfile, {
      steps: 4,
      bevelEnabled: false,
      extrudePath: stemPath,
    });
    const stem = new THREE.Mesh(stemGeo, mat.clone());
    stem.position.set(Math.cos(angle) * hubRadius, Math.sin(angle) * hubRadius, -dishDepth);
    stem.rotation.z = angle - Math.PI / 2;
    group.add(stem);

    const branchLen = spokeLength - splitPoint;
    for (const side of [-1, 1]) {
      const branchProfile = createSpokeProfile(branchWidth, spokeThickness * 0.85);
      const branchPath = new THREE.LineCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * Math.sin(splitAngle) * branchLen, Math.cos(splitAngle) * branchLen, dishDepth * (1 - spokeSplitRatio))
      );
      const branchGeo = new THREE.ExtrudeGeometry(branchProfile, {
        steps: 3,
        bevelEnabled: false,
        extrudePath: branchPath,
      });
      const branch = new THREE.Mesh(branchGeo, mat.clone());
      const stemEndX = Math.cos(angle) * hubRadius + Math.cos(angle - Math.PI / 2) * 0;
      const stemEndY = Math.sin(angle) * hubRadius + Math.sin(angle - Math.PI / 2) * 0;

      branch.position.set(
        Math.cos(angle) * (hubRadius + splitPoint * Math.cos(0)),
        Math.sin(angle) * (hubRadius + splitPoint * Math.cos(0)),
        -dishDepth + dishDepth * spokeSplitRatio
      );
      branch.rotation.z = angle - Math.PI / 2;
      group.add(branch);
    }
  }
}

function buildDoubleSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const gap = spokeWidth * 0.6;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;

    for (const offset of [-gap, gap]) {
      const profile = createSpokeProfile(spokeWidth * 0.45, spokeThickness * 0.8);
      const path = new THREE.LineCurve3(
        new THREE.Vector3(offset, 0, 0),
        new THREE.Vector3(offset * 0.6, spokeLength, dishDepth)
      );
      const geo = new THREE.ExtrudeGeometry(profile, {
        steps: 4,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 1,
        extrudePath: path,
      });
      const spoke = new THREE.Mesh(geo, mat.clone());
      spoke.position.set(Math.cos(angle) * hubRadius, Math.sin(angle) * hubRadius, -dishDepth);
      spoke.rotation.z = angle - Math.PI / 2;
      group.add(spoke);
    }
  }
}

function buildTurbineSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeCurvature, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const curveAmount = Math.max(spokeCurvature, 0.3) * spokeLength * 0.5;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const segments = 16;
    const points: THREE.Vector3[] = [];

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const widthTaper = 1 - t * 0.3;
      const x = Math.sin(t * Math.PI * 0.8) * curveAmount * widthTaper;
      const y = t * spokeLength;
      const z = t * dishDepth;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const taperWidth = spokeWidth * 1.2;
    const profile = createSpokeProfile(taperWidth, spokeThickness);
    const geo = new THREE.ExtrudeGeometry(profile, {
      steps: segments,
      bevelEnabled: false,
      extrudePath: curve,
    });

    const spoke = new THREE.Mesh(geo, mat.clone());
    spoke.position.set(Math.cos(angle) * hubRadius, Math.sin(angle) * hubRadius, -dishDepth);
    spoke.rotation.z = angle - Math.PI / 2;
    group.add(spoke);
  }
}

function buildMeshSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const effectiveCount = Math.max(spokeCount, 8);
  const thinWidth = spokeWidth * 0.5;

  for (let i = 0; i < effectiveCount; i++) {
    const angle = (i / effectiveCount) * Math.PI * 2;
    const profile = createSpokeProfile(thinWidth, spokeThickness * 0.6);
    const path = new THREE.LineCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, spokeLength, dishDepth)
    );
    const geo = new THREE.ExtrudeGeometry(profile, {
      steps: 2,
      bevelEnabled: false,
      extrudePath: path,
    });
    const spoke = new THREE.Mesh(geo, mat.clone());
    spoke.position.set(Math.cos(angle) * hubRadius, Math.sin(angle) * hubRadius, -dishDepth);
    spoke.rotation.z = angle - Math.PI / 2;
    group.add(spoke);
  }

  const crossCount = 3;
  for (let r = 0; r < crossCount; r++) {
    const t = (r + 1) / (crossCount + 1);
    const ringRadius = hubRadius + spokeLength * t;
    const crossGeo = new THREE.TorusGeometry(ringRadius, thinWidth * 0.35, 8, effectiveCount * 2);
    const crossMesh = new THREE.Mesh(crossGeo, mat.clone());
    crossMesh.position.z = -dishDepth + dishDepth * t;
    group.add(crossMesh);
  }
}

function buildSplit5Spokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const mainWidth = spokeWidth * 1.4;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;

    const shape = new THREE.Shape();
    const hw = mainWidth * 0.5;
    const tipW = mainWidth * 0.25;
    const slotW = mainWidth * 0.08;
    const slotStart = spokeLength * 0.2;
    const slotEnd = spokeLength * 0.85;

    shape.moveTo(-hw, 0);
    shape.lineTo(-tipW, spokeLength);
    shape.lineTo(-slotW, spokeLength);
    shape.lineTo(-slotW, slotEnd);
    shape.lineTo(-slotW, slotStart);
    shape.lineTo(slotW, slotStart);
    shape.lineTo(slotW, slotEnd);
    shape.lineTo(slotW, spokeLength);
    shape.lineTo(tipW, spokeLength);
    shape.lineTo(hw, 0);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: spokeThickness,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -spokeThickness / 2);

    const spoke = new THREE.Mesh(geo, mat.clone());
    spoke.position.set(Math.cos(angle) * hubRadius, Math.sin(angle) * hubRadius, -dishDepth);
    spoke.rotation.z = angle - Math.PI / 2;
    group.add(spoke);
  }
}

function buildFanSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeCurvature, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const curveAmount = Math.max(spokeCurvature, 0.15) * spokeLength * 0.3;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const segments = 10;
    const wideEnd = spokeWidth * 1.8;
    const narrowEnd = spokeWidth * 0.6;

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const w = narrowEnd + (wideEnd - narrowEnd) * t;
      const hw = w / 2;
      const ht = spokeThickness / 2;
      const x = Math.sin(t * Math.PI * 0.6) * curveAmount;
      const y = t * spokeLength;
      const z = t * dishDepth;

      vertices.push(x - hw, y, z - ht);
      vertices.push(x + hw, y, z - ht);
      vertices.push(x + hw, y, z + ht);
      vertices.push(x - hw, y, z + ht);
    }

    for (let s = 0; s < segments; s++) {
      const a = s * 4;
      const b = (s + 1) * 4;
      for (let f = 0; f < 4; f++) {
        const f2 = (f + 1) % 4;
        indices.push(a + f, b + f, b + f2);
        indices.push(a + f, b + f2, a + f2);
      }
    }

    const first = 0;
    indices.push(first, first + 1, first + 2);
    indices.push(first, first + 2, first + 3);

    const last = segments * 4;
    indices.push(last, last + 2, last + 1);
    indices.push(last, last + 3, last + 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const spoke = new THREE.Mesh(geo, mat.clone());
    spoke.position.set(Math.cos(angle) * hubRadius, Math.sin(angle) * hubRadius, -dishDepth);
    spoke.rotation.z = angle - Math.PI / 2;
    group.add(spoke);
  }
}

function buildMultipieceSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  buildStraightSpokes(group, p, mat);

  const { outerRadius, rimDepth, lipWidth, barrelDepth } = p;
  const boltRingRadius = outerRadius + rimDepth * 0.15;
  const boltCount = 24;
  const boltMat = mat.clone();
  boltMat.color.set(0x888888);
  boltMat.roughness = 0.5;

  for (let i = 0; i < boltCount; i++) {
    const angle = (i / boltCount) * Math.PI * 2;
    const boltGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.025, 6);
    boltGeo.rotateX(Math.PI / 2);
    const bolt = new THREE.Mesh(boltGeo, boltMat.clone());
    bolt.position.set(
      Math.cos(angle) * boltRingRadius,
      Math.sin(angle) * boltRingRadius,
      lipWidth * 0.3
    );
    group.add(bolt);
  }
}

function buildClassicSpokes(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const { spokeCount, spokeWidth, hubRadius, outerRadius, rimDepth, dishDepth, spokeThickness } = p;
  const spokeLength = outerRadius - rimDepth * 0.3 - hubRadius;
  const starWidth = spokeWidth * 1.6;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;

    const shape = new THREE.Shape();
    const hw = starWidth * 0.5;
    const midW = starWidth * 0.65;
    const tipW = starWidth * 0.2;
    const midPoint = spokeLength * 0.35;

    shape.moveTo(-hw * 0.4, 0);
    shape.quadraticCurveTo(-midW, midPoint * 0.5, -midW * 0.5, midPoint);
    shape.quadraticCurveTo(-tipW * 1.5, spokeLength * 0.7, -tipW, spokeLength);
    shape.lineTo(tipW, spokeLength);
    shape.quadraticCurveTo(tipW * 1.5, spokeLength * 0.7, midW * 0.5, midPoint);
    shape.quadraticCurveTo(midW, midPoint * 0.5, hw * 0.4, 0);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: spokeThickness * 1.2,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 3,
    });
    geo.translate(0, 0, -spokeThickness * 0.6);

    const spoke = new THREE.Mesh(geo, mat.clone());
    spoke.position.set(Math.cos(angle) * hubRadius, Math.sin(angle) * hubRadius, -dishDepth);
    spoke.rotation.z = angle - Math.PI / 2;
    group.add(spoke);
  }
}

function buildFaceDisc(group: THREE.Group, p: WheelParams, mat: THREE.MeshPhysicalMaterial) {
  const innerR = p.hubRadius * 1.05;
  const outerR = p.outerRadius - p.rimDepth * 0.25;
  const ringGeo = new THREE.RingGeometry(innerR, outerR, 80, 1);
  const ringMat = mat.clone();
  ringMat.transparent = true;
  ringMat.opacity = 0.03;
  ringMat.side = THREE.DoubleSide;
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.z = -p.dishDepth * 0.5;
  ring.name = "faceDisc";
  group.add(ring);
}

const SPOKE_BUILDERS: Record<SpokePattern, (g: THREE.Group, p: WheelParams, m: THREE.MeshPhysicalMaterial) => void> = {
  straight: buildStraightSpokes,
  double: buildDoubleSpokes,
  ysplit: buildYSplitSpokes,
  curved: buildCurvedSpokes,
  turbine: buildTurbineSpokes,
  mesh: buildMeshSpokes,
  split5: buildSplit5Spokes,
  fan: buildFanSpokes,
  multipiece: buildMultipieceSpokes,
  classic: buildClassicSpokes,
};

export function generateWheelMesh(params: WheelParams): THREE.Group {
  const group = new THREE.Group();
  const mat = createRimMaterial();

  buildRimAndBarrel(group, params, mat);
  buildHub(group, params, mat);

  const builder = SPOKE_BUILDERS[params.spokePattern] || buildStraightSpokes;
  builder(group, params, mat);

  buildFaceDisc(group, params, mat);

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return group;
}

export interface WheelMaterialParams {
  color: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export function updateWheelMaterials(group: THREE.Group, params: WheelMaterialParams): void {
  const color = new THREE.Color(params.color);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhysicalMaterial) {
      if (child.name === "lisere" || child.name === "gravure" || child.name === "photoFace") return;
      child.material.color.copy(color);
      child.material.metalness = params.metalness;
      child.material.roughness = params.roughness;
      child.material.clearcoat = params.clearcoat;
      child.material.clearcoatRoughness = params.clearcoatRoughness;
      child.material.needsUpdate = true;
    }
  });
}

export function addLisereRing(
  group: THREE.Group,
  outerRadius: number,
  rimDepth: number,
  color: string,
  thickness: number
): THREE.Mesh {
  const existingLisere = group.getObjectByName("lisere") as THREE.Mesh | undefined;
  if (existingLisere) group.remove(existingLisere);

  const lisereGeometry = new THREE.TorusGeometry(
    outerRadius + rimDepth * 0.2,
    thickness * 0.01,
    12,
    80
  );
  const lisereMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.3,
    roughness: 0.4,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.15,
  });
  const lisereMesh = new THREE.Mesh(lisereGeometry, lisereMaterial);
  lisereMesh.name = "lisere";
  group.add(lisereMesh);
  return lisereMesh;
}

export function removeLisere(group: THREE.Group): void {
  const lisere = group.getObjectByName("lisere");
  if (lisere) group.remove(lisere);
}

export function addGravureText(
  group: THREE.Group,
  text: string,
  outerRadius: number
): void {
  const existing = group.getObjectByName("gravure") as THREE.Mesh | undefined;
  if (existing) {
    if (existing.material instanceof THREE.MeshStandardMaterial && existing.material.map) {
      existing.material.map.dispose();
    }
    if (existing.material instanceof THREE.Material) existing.material.dispose();
    if (existing.geometry) existing.geometry.dispose();
    group.remove(existing);
  }
  if (!text.trim()) return;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 64);
  ctx.fillStyle = "rgba(200,200,200,0.6)";
  ctx.font = "bold 28px 'Exo 2', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 20), 256, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const planeGeometry = new THREE.PlaneGeometry(outerRadius * 0.6, outerRadius * 0.08);
  const planeMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    metalness: 0.5,
    roughness: 0.3,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.name = "gravure";
  plane.position.set(0, -outerRadius * 0.45, 0.15);
  group.add(plane);
}

export function applyPhotoTexture(
  group: THREE.Group,
  photoDataUrl: string,
  outerRadius: number,
  hubRadius: number,
  dishDepth: number,
  opacity: number = 0.85
): void {
  removePhotoTexture(group);

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = Math.max(size / img.width, size / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);

    const innerRatio = (hubRadius * 0.9) / outerRadius;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * innerRatio / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const discRadius = outerRadius - outerRadius * 0.05;
    const geo = new THREE.CircleGeometry(discRadius, 80);
    const mat = new THREE.MeshPhysicalMaterial({
      map: texture,
      transparent: true,
      opacity: opacity,
      metalness: 0.6,
      roughness: 0.25,
      clearcoat: 0.3,
      side: THREE.FrontSide,
      depthWrite: true,
      alphaTest: 0.01,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "photoFace";
    mesh.position.z = -dishDepth * 0.3 + 0.005;
    mesh.renderOrder = 10;
    group.add(mesh);
  };
  img.src = photoDataUrl;
}

export function removePhotoTexture(group: THREE.Group): void {
  const existing = group.getObjectByName("photoFace") as THREE.Mesh | undefined;
  if (existing) {
    if (existing.material instanceof THREE.MeshPhysicalMaterial && existing.material.map) {
      existing.material.map.dispose();
    }
    if (existing.material instanceof THREE.Material) existing.material.dispose();
    if (existing.geometry) existing.geometry.dispose();
    group.remove(existing);
  }
}
