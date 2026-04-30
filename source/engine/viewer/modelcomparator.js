import { Coord3D } from '../geometry/coord3d.js';
import { RGBColor } from '../model/color.js';
import { TraverseThreeObject } from './viewer.js';

import * as THREE from 'three';

export const DiffType =
{
	Identical : 0,
	Added : 1,
	Removed : 2,
	Modified : 3
};

export const DiffColor =
{
	Identical : new RGBColor (200, 200, 200),
	Added : new RGBColor (0, 200, 0),
	Removed : new RGBColor (200, 0, 0),
	Modified : new RGBColor (0, 150, 255)
};

export class ModelDiffInfo
{
	constructor ()
	{
		this.totalMeshes = 0;
		this.totalTriangles = 0;
		this.totalVertices = 0;
		this.addedMeshes = 0;
		this.removedMeshes = 0;
		this.modifiedMeshes = 0;
		this.addedTriangles = 0;
		this.removedTriangles = 0;
		this.modifiedTriangles = 0;
	}

	Add (other)
	{
		this.totalMeshes += other.totalMeshes;
		this.totalTriangles += other.totalTriangles;
		this.totalVertices += other.totalVertices;
		this.addedMeshes += other.addedMeshes;
		this.removedMeshes += other.removedMeshes;
		this.modifiedMeshes += other.modifiedMeshes;
		this.addedTriangles += other.addedTriangles;
		this.removedTriangles += other.removedTriangles;
		this.modifiedTriangles += other.modifiedTriangles;
	}

	HasDifferences ()
	{
		return this.addedMeshes > 0 || this.removedMeshes > 0 || this.modifiedMeshes > 0;
	}
}

function VertexToKey (vertex)
{
	const precision = 1000000;
	const x = Math.round (vertex.x * precision);
	const y = Math.round (vertex.y * precision);
	const z = Math.round (vertex.z * precision);
	return `${x},${y},${z}`;
}

function TriangleToKey (triangle, vertices)
{
	const v0 = VertexToKey (vertices[triangle.v0]);
	const v1 = VertexToKey (vertices[triangle.v1]);
	const v2 = VertexToKey (vertices[triangle.v2]);
	const keys = [v0, v1, v2].sort ();
	return keys.join ('|');
}

function MeshToSignature (mesh)
{
	const signature = {
		vertexCount : mesh.VertexCount (),
		triangleCount : mesh.TriangleCount (),
		vertices : [],
		triangles : new Map ()
	};

	for (let i = 0; i < mesh.VertexCount (); i++) {
		const vertex = mesh.GetVertex (i);
		signature.vertices.push (new Coord3D (vertex.x, vertex.y, vertex.z));
	}

	for (let i = 0; i < mesh.TriangleCount (); i++) {
		const triangle = mesh.GetTriangle (i);
		const key = TriangleToKey (triangle, signature.vertices);
		if (!signature.triangles.has (key)) {
			signature.triangles.set (key, []);
		}
		signature.triangles.get (key).push (i);
	}

	return signature;
}

function CompareMeshes (meshA, meshB)
{
	const result = {
		type : DiffType.Identical,
		meshADiffTriangles : [],
		meshBDiffTriangles : []
	};

	if (meshA === null || meshB === null) {
		result.type = (meshA === null) ? DiffType.Added : DiffType.Removed;
		return result;
	}

	const sigA = MeshToSignature (meshA);
	const sigB = MeshToSignature (meshB);

	const allTriangleKeys = new Set ();
	for (const key of sigA.triangles.keys ()) {
		allTriangleKeys.add (key);
	}
	for (const key of sigB.triangles.keys ()) {
		allTriangleKeys.add (key);
	}

	let hasAdded = false;
	let hasRemoved = false;

	for (const key of allTriangleKeys) {
		const inA = sigA.triangles.has (key);
		const inB = sigB.triangles.has (key);

		if (!inA && inB) {
			hasAdded = true;
			const trianglesB = sigB.triangles.get (key);
			for (const triIndex of trianglesB) {
				result.meshBDiffTriangles.push (triIndex);
			}
		} else if (inA && !inB) {
			hasRemoved = true;
			const trianglesA = sigA.triangles.get (key);
			for (const triIndex of trianglesA) {
				result.meshADiffTriangles.push (triIndex);
			}
		} else {
			const trianglesA = sigA.triangles.get (key);
			const trianglesB = sigB.triangles.get (key);
			if (trianglesA.length !== trianglesB.length) {
				if (trianglesB.length > trianglesA.length) {
					hasAdded = true;
					for (let i = trianglesA.length; i < trianglesB.length; i++) {
						result.meshBDiffTriangles.push (trianglesB[i]);
					}
				} else {
					hasRemoved = true;
					for (let i = trianglesB.length; i < trianglesA.length; i++) {
						result.meshADiffTriangles.push (trianglesA[i]);
					}
				}
			}
		}
	}

	if (hasAdded && hasRemoved) {
		result.type = DiffType.Modified;
	} else if (hasAdded) {
		result.type = DiffType.Added;
	} else if (hasRemoved) {
		result.type = DiffType.Removed;
	}

	return result;
}

function FindMatchingMesh (mesh, meshes, usedIndices)
{
	const sigA = MeshToSignature (mesh);
	let bestMatch = null;
	let bestMatchIndex = -1;

	for (let i = 0; i < meshes.length; i++) {
		if (usedIndices.has (i)) {
			continue;
		}
		const otherMesh = meshes[i];
		if (otherMesh.GetName () === mesh.GetName ()) {
			const sigB = MeshToSignature (otherMesh);
			if (sigA.vertexCount === sigB.vertexCount || sigA.triangleCount === sigB.triangleCount) {
				return { mesh : otherMesh, index : i };
			}
		}
	}

	for (let i = 0; i < meshes.length; i++) {
		if (usedIndices.has (i)) {
			continue;
		}
		const otherMesh = meshes[i];
		const sigB = MeshToSignature (otherMesh);
		if (sigA.vertexCount === sigB.vertexCount && sigA.triangleCount === sigB.triangleCount) {
			if (bestMatch === null) {
				bestMatch = otherMesh;
				bestMatchIndex = i;
			}
		}
	}

	if (bestMatch !== null) {
		return { mesh : bestMatch, index : bestMatchIndex };
	}

	return null;
}

function ConvertColorToThreeColor (color)
{
	return new THREE.Color (
		color.r / 255.0,
		color.g / 255.0,
		color.b / 255.0
	);
}

function CreateDiffMaterial (originalMaterial, diffType, opacity = 1.0)
{
	let color = DiffColor.Identical;
	if (diffType === DiffType.Added) {
		color = DiffColor.Added;
	} else if (diffType === DiffType.Removed) {
		color = DiffColor.Removed;
	} else if (diffType === DiffType.Modified) {
		color = DiffColor.Modified;
	}

	const threeColor = ConvertColorToThreeColor (color);

	let material = null;
	if (originalMaterial === null) {
		material = new THREE.MeshPhongMaterial ({
			color : threeColor,
			side : THREE.DoubleSide,
			transparent : opacity < 1.0,
			opacity : opacity
		});
	} else if (originalMaterial.type === 'MeshPhongMaterial') {
		material = new THREE.MeshPhongMaterial ({
			color : threeColor,
			side : THREE.DoubleSide,
			transparent : opacity < 1.0,
			opacity : opacity
		});
	} else if (originalMaterial.type === 'MeshStandardMaterial') {
		material = new THREE.MeshStandardMaterial ({
			color : threeColor,
			side : THREE.DoubleSide,
			transparent : opacity < 1.0,
			opacity : opacity
		});
	} else if (originalMaterial.type === 'LineBasicMaterial') {
		material = new THREE.LineBasicMaterial ({
			color : threeColor,
			transparent : opacity < 1.0,
			opacity : opacity
		});
	}

	return material;
}

function CreateVertexColorGeometry (geometry, triangleIndices, diffType)
{
	const positionAttr = geometry.getAttribute ('position');
	const vertexCount = positionAttr.count;

	const colors = new Float32Array (vertexCount * 3);
	const triangleSet = new Set (triangleIndices);

	let color = DiffColor.Identical;
	if (diffType === DiffType.Added) {
		color = DiffColor.Added;
	} else if (diffType === DiffType.Removed) {
		color = DiffColor.Removed;
	} else if (diffType === DiffType.Modified) {
		color = DiffColor.Modified;
	}

	const r = color.r / 255.0;
	const g = color.g / 255.0;
	const b = color.b / 255.0;

	if (geometry.index !== null) {
		const indices = geometry.index.array;
		for (let i = 0; i < indices.length; i += 3) {
			const triangleIndex = i / 3;
			const v0 = indices[i];
			const v1 = indices[i + 1];
			const v2 = indices[i + 2];
			const applyColor = triangleSet.has (triangleIndex);
			if (applyColor) {
				colors[v0 * 3] = r;
				colors[v0 * 3 + 1] = g;
				colors[v0 * 3 + 2] = b;
				colors[v1 * 3] = r;
				colors[v1 * 3 + 1] = g;
				colors[v1 * 3 + 2] = b;
				colors[v2 * 3] = r;
				colors[v2 * 3 + 1] = g;
				colors[v2 * 3 + 2] = b;
			} else {
				const identColor = DiffColor.Identical;
				colors[v0 * 3] = identColor.r / 255.0;
				colors[v0 * 3 + 1] = identColor.g / 255.0;
				colors[v0 * 3 + 2] = identColor.b / 255.0;
				colors[v1 * 3] = identColor.r / 255.0;
				colors[v1 * 3 + 1] = identColor.g / 255.0;
				colors[v1 * 3 + 2] = identColor.b / 255.0;
				colors[v2 * 3] = identColor.r / 255.0;
				colors[v2 * 3 + 1] = identColor.g / 255.0;
				colors[v2 * 3 + 2] = identColor.b / 255.0;
			}
		}
	} else {
		for (let i = 0; i < vertexCount; i += 3) {
			const triangleIndex = i / 3;
			const applyColor = triangleSet.has (triangleIndex);
			if (applyColor) {
				colors[i * 3] = r;
				colors[i * 3 + 1] = g;
				colors[i * 3 + 2] = b;
				colors[(i + 1) * 3] = r;
				colors[(i + 1) * 3 + 1] = g;
				colors[(i + 1) * 3 + 2] = b;
				colors[(i + 2) * 3] = r;
				colors[(i + 2) * 3 + 1] = g;
				colors[(i + 2) * 3 + 2] = b;
			} else {
				const identColor = DiffColor.Identical;
				colors[i * 3] = identColor.r / 255.0;
				colors[i * 3 + 1] = identColor.g / 255.0;
				colors[i * 3 + 2] = identColor.b / 255.0;
				colors[(i + 1) * 3] = identColor.r / 255.0;
				colors[(i + 1) * 3 + 1] = identColor.g / 255.0;
				colors[(i + 1) * 3 + 2] = identColor.b / 255.0;
				colors[(i + 2) * 3] = identColor.r / 255.0;
				colors[(i + 2) * 3 + 1] = identColor.g / 255.0;
				colors[(i + 2) * 3 + 2] = identColor.b / 255.0;
			}
		}
	}

	const newGeometry = geometry.clone ();
	newGeometry.setAttribute ('color', new THREE.BufferAttribute (colors, 3));
	return newGeometry;
}

export class ModelComparator
{
	constructor ()
	{
		this.modelA = null;
		this.modelB = null;
		this.threeObjectA = null;
		this.threeObjectB = null;
		this.diffInfo = null;
		this.overlayOpacity = 0.5;
		this.diffEnabled = false;
	}

	SetModels (modelA, modelB, threeObjectA, threeObjectB)
	{
		this.modelA = modelA;
		this.modelB = modelB;
		this.threeObjectA = threeObjectA;
		this.threeObjectB = threeObjectB;
		this.diffInfo = new ModelDiffInfo ();
		this.diffEnabled = false;
	}

	SetOverlayOpacity (opacity)
	{
		this.overlayOpacity = Math.max (0.0, Math.min (1.0, opacity));
	}

	GetOverlayOpacity ()
	{
		return this.overlayOpacity;
	}

	Compare ()
	{
		if (this.modelA === null || this.modelB === null) {
			this.diffInfo = new ModelDiffInfo ();
			return this.diffInfo;
		}

		this.diffInfo = new ModelDiffInfo ();

		const meshesA = [];
		const meshesB = [];

		for (let i = 0; i < this.modelA.MeshCount (); i++) {
			meshesA.push (this.modelA.GetMesh (i));
		}
		for (let i = 0; i < this.modelB.MeshCount (); i++) {
			meshesB.push (this.modelB.GetMesh (i));
		}

		const usedIndicesB = new Set ();

		for (const meshA of meshesA) {
			const match = FindMatchingMesh (meshA, meshesB, usedIndicesB);
			this.diffInfo.totalMeshes++;
			this.diffInfo.totalTriangles += meshA.TriangleCount ();
			this.diffInfo.totalVertices += meshA.VertexCount ();

			if (match === null) {
				this.diffInfo.removedMeshes++;
				this.diffInfo.removedTriangles += meshA.TriangleCount ();
			} else {
				usedIndicesB.add (match.index);
				const meshB = match.mesh;
				const compareResult = CompareMeshes (meshA, meshB);
				if (compareResult.type !== DiffType.Identical) {
					this.diffInfo.modifiedMeshes++;
					this.diffInfo.modifiedTriangles += compareResult.meshADiffTriangles.length;
					this.diffInfo.modifiedTriangles += compareResult.meshBDiffTriangles.length;
				}
			}
		}

		for (let i = 0; i < meshesB.length; i++) {
			if (!usedIndicesB.has (i)) {
				const meshB = meshesB[i];
				this.diffInfo.addedMeshes++;
				this.diffInfo.addedTriangles += meshB.TriangleCount ();
			}
		}

		return this.diffInfo;
	}

	ApplyDiffVisualization (diffTypeA, diffTypeB)
	{
		if (this.threeObjectA === null || this.threeObjectB === null) {
			return;
		}

		this.diffEnabled = true;

		TraverseThreeObject (this.threeObjectA, (obj) => {
			if (obj.isMesh) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
					obj.userData.originalGeometry = obj.geometry;
				}
				if (Array.isArray (obj.material)) {
					const newMaterials = [];
					for (const mat of obj.material) {
						newMaterials.push (CreateDiffMaterial (mat, diffTypeA, this.overlayOpacity));
					}
					obj.material = newMaterials;
				} else {
					obj.material = CreateDiffMaterial (obj.material, diffTypeA, this.overlayOpacity);
				}
			}
			return true;
		});

		TraverseThreeObject (this.threeObjectB, (obj) => {
			if (obj.isMesh) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
					obj.userData.originalGeometry = obj.geometry;
				}
				if (Array.isArray (obj.material)) {
					const newMaterials = [];
					for (const mat of obj.material) {
						newMaterials.push (CreateDiffMaterial (mat, diffTypeB, this.overlayOpacity));
					}
					obj.material = newMaterials;
				} else {
					obj.material = CreateDiffMaterial (obj.material, diffTypeB, this.overlayOpacity);
				}
			}
			return true;
		});
	}

	ApplyOverlayMode ()
	{
		if (this.threeObjectA === null || this.threeObjectB === null) {
			return;
		}

		this.diffEnabled = true;

		TraverseThreeObject (this.threeObjectA, (obj) => {
			if (obj.isMesh || obj.isLineSegments) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
					obj.userData.originalGeometry = obj.geometry;
				}
				if (Array.isArray (obj.material)) {
					const newMaterials = [];
					for (const mat of obj.material) {
						newMaterials.push (this.CreateOverlayMaterial (mat, this.overlayOpacity));
					}
					obj.material = newMaterials;
				} else {
					obj.material = this.CreateOverlayMaterial (obj.material, this.overlayOpacity);
				}
			}
			return true;
		});

		TraverseThreeObject (this.threeObjectB, (obj) => {
			if (obj.isMesh || obj.isLineSegments) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
					obj.userData.originalGeometry = obj.geometry;
				}
				if (Array.isArray (obj.material)) {
					const newMaterials = [];
					for (const mat of obj.material) {
						newMaterials.push (this.CreateOverlayMaterial (mat, this.overlayOpacity));
					}
					obj.material = newMaterials;
				} else {
					obj.material = this.CreateOverlayMaterial (obj.material, this.overlayOpacity);
				}
			}
			return true;
		});
	}

	CreateOverlayMaterial (originalMaterial, opacity)
	{
		let material = null;
		if (originalMaterial.type === 'MeshPhongMaterial') {
			material = originalMaterial.clone ();
			material.transparent = true;
			material.opacity = opacity;
			material.depthWrite = false;
		} else if (originalMaterial.type === 'MeshStandardMaterial') {
			material = originalMaterial.clone ();
			material.transparent = true;
			material.opacity = opacity;
			material.depthWrite = false;
		} else if (originalMaterial.type === 'LineBasicMaterial') {
			material = originalMaterial.clone ();
			material.transparent = true;
			material.opacity = opacity;
		} else {
			material = new THREE.MeshPhongMaterial ({
				color : 0x888888,
				side : THREE.DoubleSide,
				transparent : true,
				opacity : opacity,
				depthWrite : false
			});
		}
		return material;
	}

	RestoreOriginalMaterials ()
	{
		if (!this.diffEnabled) {
			return;
		}

		this.diffEnabled = false;

		if (this.threeObjectA !== null) {
			TraverseThreeObject (this.threeObjectA, (obj) => {
				if ((obj.isMesh || obj.isLineSegments) && obj.userData.originalMaterials !== undefined) {
					obj.material = obj.userData.originalMaterials;
					if (obj.userData.originalGeometry !== undefined) {
						obj.geometry = obj.userData.originalGeometry;
					}
				}
				return true;
			});
		}

		if (this.threeObjectB !== null) {
			TraverseThreeObject (this.threeObjectB, (obj) => {
				if ((obj.isMesh || obj.isLineSegments) && obj.userData.originalMaterials !== undefined) {
					obj.material = obj.userData.originalMaterials;
					if (obj.userData.originalGeometry !== undefined) {
						obj.geometry = obj.userData.originalGeometry;
					}
				}
				return true;
			});
		}
	}

	GetDiffInfo ()
	{
		return this.diffInfo;
	}

	HasDifferences ()
	{
		return this.diffInfo !== null && this.diffInfo.HasDifferences ();
	}
}
