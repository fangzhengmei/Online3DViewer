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
	Added : new RGBColor (0, 255, 0),
	Removed : new RGBColor (255, 0, 0),
	Modified : new RGBColor (0, 150, 255)
};

export class MeshDiffInfo
{
	constructor ()
	{
		this.meshName = '';
		this.diffType = DiffType.Identical;
		this.totalTriangles = 0;
		this.addedTriangles = [];
		this.removedTriangles = [];
		this.modifiedTrianglesA = [];
		this.modifiedTrianglesB = [];
		this.vertexMapA = new Map ();
		this.vertexMapB = new Map ();
	}

	HasDifferences ()
	{
		return this.diffType !== DiffType.Identical;
	}

	GetDiffTriangleCount ()
	{
		return this.addedTriangles.length +
			this.removedTriangles.length +
			this.modifiedTrianglesA.length +
			this.modifiedTrianglesB.length;
	}
}

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
		this.meshDiffs = [];
	}

	AddMeshDiff (meshDiff)
	{
		this.meshDiffs.push (meshDiff);

		if (meshDiff.diffType === DiffType.Added) {
			this.addedMeshes++;
			this.addedTriangles += meshDiff.addedTriangles.length;
		} else if (meshDiff.diffType === DiffType.Removed) {
			this.removedMeshes++;
			this.removedTriangles += meshDiff.removedTriangles.length;
		} else if (meshDiff.diffType === DiffType.Modified) {
			this.modifiedMeshes++;
			this.modifiedTriangles += meshDiff.modifiedTrianglesA.length;
			this.modifiedTriangles += meshDiff.modifiedTrianglesB.length;
		}
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
		this.meshDiffs = this.meshDiffs.concat (other.meshDiffs);
	}

	HasDifferences ()
	{
		return this.addedMeshes > 0 || this.removedMeshes > 0 || this.modifiedMeshes > 0;
	}
}

function VertexToKey (vertex, precision = 1000000)
{
	const x = Math.round (vertex.x * precision);
	const y = Math.round (vertex.y * precision);
	const z = Math.round (vertex.z * precision);
	return `${x},${y},${z}`;
}

function TriangleToVerticesKey (triangle, vertices, precision = 1000000)
{
	const v0 = VertexToKey (vertices[triangle.v0], precision);
	const v1 = VertexToKey (vertices[triangle.v1], precision);
	const v2 = VertexToKey (vertices[triangle.v2], precision);
	const keys = [v0, v1, v2].sort ();
	return keys.join ('|');
}

function BuildTriangleSignatureMap (mesh)
{
	const signatureMap = new Map ();
	const vertices = [];

	for (let i = 0; i < mesh.VertexCount (); i++) {
		vertices.push (mesh.GetVertex (i));
	}

	for (let i = 0; i < mesh.TriangleCount (); i++) {
		const triangle = mesh.GetTriangle (i);
		const key = TriangleToVerticesKey (triangle, vertices);

		if (!signatureMap.has (key)) {
			signatureMap.set (key, []);
		}
		signatureMap.get (key).push (i);
	}

	return signatureMap;
}

function CompareMeshTriangles (meshA, meshB)
{
	const result = new MeshDiffInfo ();
	result.totalTriangles = meshA.TriangleCount ();

	if (meshA.GetName () !== null) {
		result.meshName = meshA.GetName ();
	}

	const sigMapA = BuildTriangleSignatureMap (meshA);
	const sigMapB = BuildTriangleSignatureMap (meshB);

	const allKeys = new Set ();
	for (const key of sigMapA.keys ()) {
		allKeys.add (key);
	}
	for (const key of sigMapB.keys ()) {
		allKeys.add (key);
	}

	let hasAdded = false;
	let hasRemoved = false;

	for (const key of allKeys) {
		const inA = sigMapA.has (key);
		const inB = sigMapB.has (key);

		if (!inA && inB) {
			hasAdded = true;
			const trisB = sigMapB.get (key);
			for (const triIndex of trisB) {
				result.addedTriangles.push (triIndex);
			}
		} else if (inA && !inB) {
			hasRemoved = true;
			const trisA = sigMapA.get (key);
			for (const triIndex of trisA) {
				result.removedTriangles.push (triIndex);
			}
		} else {
			const trisA = sigMapA.get (key);
			const trisB = sigMapB.get (key);

			if (trisB.length > trisA.length) {
				hasAdded = true;
				for (let i = trisA.length; i < trisB.length; i++) {
					result.addedTriangles.push (trisB[i]);
				}
			} else if (trisA.length > trisB.length) {
				hasRemoved = true;
				for (let i = trisB.length; i < trisA.length; i++) {
					result.removedTriangles.push (trisA[i]);
				}
			}
		}
	}

	if (hasAdded && hasRemoved) {
		result.diffType = DiffType.Modified;
		for (const tri of result.addedTriangles) {
			result.modifiedTrianglesB.push (tri);
		}
		for (const tri of result.removedTriangles) {
			result.modifiedTrianglesA.push (tri);
		}
		result.addedTriangles = [];
		result.removedTriangles = [];
	} else if (hasAdded) {
		result.diffType = DiffType.Added;
	} else if (hasRemoved) {
		result.diffType = DiffType.Removed;
	} else {
		result.diffType = DiffType.Identical;
	}

	return result;
}

function FindMatchingMeshByName (mesh, meshes, usedIndices)
{
	const targetName = mesh.GetName ();

	for (let i = 0; i < meshes.length; i++) {
		if (usedIndices.has (i)) {
			continue;
		}
		if (meshes[i].GetName () === targetName) {
			return { mesh : meshes[i], index : i };
		}
	}

	return null;
}

function FindMatchingMeshByGeometry (mesh, meshes, usedIndices)
{
	const vertexCount = mesh.VertexCount ();
	const triangleCount = mesh.TriangleCount ();

	for (let i = 0; i < meshes.length; i++) {
		if (usedIndices.has (i)) {
			continue;
		}
		if (meshes[i].VertexCount () === vertexCount &&
			meshes[i].TriangleCount () === triangleCount) {
			return { mesh : meshes[i], index : i };
		}
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

function CreateDiffHighlightGeometry (mesh, triangleIndices, isWireframe = false)
{
	if (triangleIndices.length === 0) {
		return null;
	}

	const positions = [];
	const vertexIndices = new Set ();

	for (const triIndex of triangleIndices) {
		const triangle = mesh.GetTriangle (triIndex);
		const v0 = mesh.GetVertex (triangle.v0);
		const v1 = mesh.GetVertex (triangle.v1);
		const v2 = mesh.GetVertex (triangle.v2);

		positions.push (v0.x, v0.y, v0.z);
		positions.push (v1.x, v1.y, v1.z);
		positions.push (v2.x, v2.y, v2.z);

		vertexIndices.add (triangle.v0);
		vertexIndices.add (triangle.v1);
		vertexIndices.add (triangle.v2);
	}

	const geometry = new THREE.BufferGeometry ();
	geometry.setAttribute ('position', new THREE.Float32BufferAttribute (positions, 3));

	if (isWireframe) {
		const indices = [];
		const triCount = triangleIndices.length;
		for (let i = 0; i < triCount; i++) {
			const base = i * 3;
			indices.push (base, base + 1, base + 1, base + 2, base + 2, base);
		}
		geometry.setIndex (indices);
	}

	return geometry;
}

function CreateDiffMaterial (diffType, isWireframe = false, opacity = 0.8)
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

	if (isWireframe) {
		return new THREE.LineBasicMaterial ({
			color : threeColor,
			linewidth : 2,
			transparent : opacity < 1.0,
			opacity : opacity
		});
	} else {
		return new THREE.MeshPhongMaterial ({
			color : threeColor,
			side : THREE.DoubleSide,
			transparent : opacity < 1.0,
			opacity : opacity,
			polygonOffset : true,
			polygonOffsetUnit : 1,
			polygonOffsetFactor : -1
		});
	}
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
		this.diffHighlightObjects = [];
		this.scene = null;
	}

	SetScene (scene)
	{
		this.scene = scene;
	}

	SetModels (modelA, modelB, threeObjectA, threeObjectB)
	{
		this.modelA = modelA;
		this.modelB = modelB;
		this.threeObjectA = threeObjectA;
		this.threeObjectB = threeObjectB;
		this.diffInfo = new ModelDiffInfo ();
		this.diffEnabled = false;
		this.ClearDiffHighlights ();
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
			let match = null;
			const meshAName = meshA.GetName ();
			if (meshAName !== null && meshAName !== '') {
				match = FindMatchingMeshByName (meshA, meshesB, usedIndicesB);
			} else {
				match = FindMatchingMeshByGeometry (meshA, meshesB, usedIndicesB);
			}

			this.diffInfo.totalMeshes++;
			this.diffInfo.totalVertices += meshA.VertexCount ();
			this.diffInfo.totalTriangles += meshA.TriangleCount ();

			if (match === null) {
				const meshDiff = new MeshDiffInfo ();
				meshDiff.meshName = meshA.GetName () || '';
				meshDiff.diffType = DiffType.Removed;
				meshDiff.totalTriangles = meshA.TriangleCount ();
				for (let i = 0; i < meshA.TriangleCount (); i++) {
					meshDiff.removedTriangles.push (i);
				}
				this.diffInfo.AddMeshDiff (meshDiff);
			} else {
				usedIndicesB.add (match.index);
				const meshDiff = CompareMeshTriangles (meshA, match.mesh);
				this.diffInfo.AddMeshDiff (meshDiff);
			}
		}

		for (let i = 0; i < meshesB.length; i++) {
			if (!usedIndicesB.has (i)) {
				const meshB = meshesB[i];
				const meshDiff = new MeshDiffInfo ();
				meshDiff.meshName = meshB.GetName () || '';
				meshDiff.diffType = DiffType.Added;
				meshDiff.totalTriangles = meshB.TriangleCount ();
				for (let j = 0; j < meshB.TriangleCount (); j++) {
					meshDiff.addedTriangles.push (j);
				}
				this.diffInfo.AddMeshDiff (meshDiff);
			}
		}

		return this.diffInfo;
	}

	ClearDiffHighlights ()
	{
		if (this.scene !== null) {
			for (const obj of this.diffHighlightObjects) {
				this.scene.remove (obj);
				if (obj.geometry) {
					obj.geometry.dispose ();
				}
				if (obj.material) {
					if (Array.isArray (obj.material)) {
						for (const mat of obj.material) {
							mat.dispose ();
						}
					} else {
						obj.material.dispose ();
					}
				}
			}
		}
		this.diffHighlightObjects = [];
	}

	CreateTriangleHighlightFromMesh (mesh, triangleIndices, diffType, isWireframe = false)
	{
		if (triangleIndices.length === 0) {
			return null;
		}

		const geometry = CreateDiffHighlightGeometry (mesh, triangleIndices, isWireframe);
		if (geometry === null) {
			return null;
		}

		const material = CreateDiffMaterial (diffType, isWireframe, 0.9);
		let highlightObj = null;

		if (isWireframe) {
			highlightObj = new THREE.LineSegments (geometry, material);
		} else {
			highlightObj = new THREE.Mesh (geometry, material);
		}

		highlightObj.userData = { isDiffHighlight : true };
		return highlightObj;
	}

	ApplyTriangleLevelDiffVisualization ()
	{
		if (this.modelA === null || this.modelB === null || this.diffInfo === null) {
			return;
		}

		this.ClearDiffHighlights ();
		this.diffEnabled = true;

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
			let match = null;
			const meshAName = meshA.GetName ();
			if (meshAName !== null && meshAName !== '') {
				match = FindMatchingMeshByName (meshA, meshesB, usedIndicesB);
			} else {
				match = FindMatchingMeshByGeometry (meshA, meshesB, usedIndicesB);
			}

			if (match === null) {
				const removedTriangles = [];
				for (let i = 0; i < meshA.TriangleCount (); i++) {
					removedTriangles.push (i);
				}
				const highlight = this.CreateTriangleHighlightFromMesh (
					meshA, removedTriangles, DiffType.Removed, false
				);
				if (highlight !== null && this.scene !== null) {
					this.scene.add (highlight);
					this.diffHighlightObjects.push (highlight);
				}
			} else {
				usedIndicesB.add (match.index);
				const meshDiff = CompareMeshTriangles (meshA, match.mesh);

				if (meshDiff.diffType === DiffType.Modified) {
					if (meshDiff.modifiedTrianglesA.length > 0) {
						const highlightA = this.CreateTriangleHighlightFromMesh (
							meshA, meshDiff.modifiedTrianglesA, DiffType.Removed, false
						);
						if (highlightA !== null && this.scene !== null) {
							this.scene.add (highlightA);
							this.diffHighlightObjects.push (highlightA);
						}
					}
					if (meshDiff.modifiedTrianglesB.length > 0) {
						const highlightB = this.CreateTriangleHighlightFromMesh (
							match.mesh, meshDiff.modifiedTrianglesB, DiffType.Added, false
						);
						if (highlightB !== null && this.scene !== null) {
							this.scene.add (highlightB);
							this.diffHighlightObjects.push (highlightB);
						}
					}
				}
			}
		}

		for (let i = 0; i < meshesB.length; i++) {
			if (!usedIndicesB.has (i)) {
				const meshB = meshesB[i];
				const addedTriangles = [];
				for (let j = 0; j < meshB.TriangleCount (); j++) {
					addedTriangles.push (j);
				}
				const highlight = this.CreateTriangleHighlightFromMesh (
					meshB, addedTriangles, DiffType.Added, false
				);
				if (highlight !== null && this.scene !== null) {
					this.scene.add (highlight);
					this.diffHighlightObjects.push (highlight);
				}
			}
		}
	}

	ApplyOverlayMode ()
	{
		if (this.threeObjectA === null || this.threeObjectB === null) {
			return;
		}

		this.ClearDiffHighlights ();
		this.diffEnabled = true;

		TraverseThreeObject (this.threeObjectA, (obj) => {
			if (obj.isMesh || obj.isLineSegments) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
				}
				obj.material = this.CreateOverlayMaterial (obj.material, this.overlayOpacity);
			}
			return true;
		});

		TraverseThreeObject (this.threeObjectB, (obj) => {
			if (obj.isMesh || obj.isLineSegments) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
				}
				obj.material = this.CreateOverlayMaterial (obj.material, this.overlayOpacity);
			}
			return true;
		});
	}

	CreateOverlayMaterial (originalMaterial, opacity)
	{
		let material = null;
		if (originalMaterial === null) {
			material = new THREE.MeshPhongMaterial ({
				color : 0x888888,
				side : THREE.DoubleSide,
				transparent : true,
				opacity : opacity,
				depthWrite : false
			});
		} else if (originalMaterial.type === 'MeshPhongMaterial') {
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
		} else if (Array.isArray (originalMaterial)) {
			const newMaterials = [];
			for (const mat of originalMaterial) {
				newMaterials.push (this.CreateOverlayMaterial (mat, opacity));
			}
			return newMaterials;
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

	ApplySimpleDiffVisualization (diffTypeA, diffTypeB)
	{
		if (this.threeObjectA === null || this.threeObjectB === null) {
			return;
		}

		this.ClearDiffHighlights ();
		this.diffEnabled = true;

		const createSimpleDiffMaterial = (originalMaterial, diffType) => {
			let color = DiffColor.Identical;
			if (diffType === DiffType.Added) {
				color = DiffColor.Added;
			} else if (diffType === DiffType.Removed) {
				color = DiffColor.Removed;
			} else if (diffType === DiffType.Modified) {
				color = DiffColor.Modified;
			}

			const threeColor = ConvertColorToThreeColor (color);

			if (originalMaterial === null) {
				return new THREE.MeshPhongMaterial ({
					color : threeColor,
					side : THREE.DoubleSide,
					transparent : this.overlayOpacity < 1.0,
					opacity : this.overlayOpacity
				});
			}

			if (originalMaterial.type === 'MeshPhongMaterial') {
				return new THREE.MeshPhongMaterial ({
					color : threeColor,
					side : THREE.DoubleSide,
					transparent : this.overlayOpacity < 1.0,
					opacity : this.overlayOpacity
				});
			} else if (originalMaterial.type === 'MeshStandardMaterial') {
				return new THREE.MeshStandardMaterial ({
					color : threeColor,
					side : THREE.DoubleSide,
					transparent : this.overlayOpacity < 1.0,
					opacity : this.overlayOpacity
				});
			} else if (originalMaterial.type === 'LineBasicMaterial') {
				return new THREE.LineBasicMaterial ({
					color : threeColor,
					transparent : this.overlayOpacity < 1.0,
					opacity : this.overlayOpacity
				});
			}

			return new THREE.MeshPhongMaterial ({
				color : threeColor,
				side : THREE.DoubleSide,
				transparent : this.overlayOpacity < 1.0,
				opacity : this.overlayOpacity
			});
		};

		TraverseThreeObject (this.threeObjectA, (obj) => {
			if (obj.isMesh) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
				}
				if (Array.isArray (obj.material)) {
					const newMaterials = [];
					for (const mat of obj.material) {
						newMaterials.push (createSimpleDiffMaterial (mat, diffTypeA));
					}
					obj.material = newMaterials;
				} else {
					obj.material = createSimpleDiffMaterial (obj.material, diffTypeA);
				}
			}
			return true;
		});

		TraverseThreeObject (this.threeObjectB, (obj) => {
			if (obj.isMesh) {
				if (obj.userData.originalMaterials === undefined) {
					obj.userData.originalMaterials = obj.material;
				}
				if (Array.isArray (obj.material)) {
					const newMaterials = [];
					for (const mat of obj.material) {
						newMaterials.push (createSimpleDiffMaterial (mat, diffTypeB));
					}
					obj.material = newMaterials;
				} else {
					obj.material = createSimpleDiffMaterial (obj.material, diffTypeB);
				}
			}
			return true;
		});
	}

	ApplyDiffVisualization (diffTypeA, diffTypeB)
	{
		if (this.diffInfo === null || !this.diffInfo.HasDifferences ()) {
			this.ApplySimpleDiffVisualization (diffTypeA, diffTypeB);
			return;
		}

		this.ApplyTriangleLevelDiffVisualization ();
	}

	RestoreOriginalMaterials ()
	{
		if (!this.diffEnabled) {
			return;
		}

		this.ClearDiffHighlights ();
		this.diffEnabled = false;

		if (this.threeObjectA !== null) {
			TraverseThreeObject (this.threeObjectA, (obj) => {
				if ((obj.isMesh || obj.isLineSegments) && obj.userData.originalMaterials !== undefined) {
					obj.material = obj.userData.originalMaterials;
				}
				return true;
			});
		}

		if (this.threeObjectB !== null) {
			TraverseThreeObject (this.threeObjectB, (obj) => {
				if ((obj.isMesh || obj.isLineSegments) && obj.userData.originalMaterials !== undefined) {
					obj.material = obj.userData.originalMaterials;
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

	GetMeshDiffs ()
	{
		if (this.diffInfo === null) {
			return [];
		}
		return this.diffInfo.meshDiffs;
	}
}
