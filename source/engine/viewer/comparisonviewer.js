import { Coord3D } from '../geometry/coord3d.js';
import { Direction } from '../geometry/geometry.js';
import { GetDefaultCamera } from './viewer.js';
import { ViewerMainModel } from './viewermodel.js';
import { ModelComparator, DiffType } from './modelcomparator.js';

import * as THREE from 'three';

export const ComparisonMode =
{
	Overlay : 'overlay',
	SideBySide : 'sideBySide',
	DiffOnly : 'diffOnly'
};

export class ComparisonViewer
{
	constructor ()
	{
		this.canvas = null;
		this.renderer = null;
		this.scene = null;
		this.camera = null;
		this.projectionMode = null;
		this.navigation = null;
		this.shadingModel = null;
		this.upVector = null;
		this.cameraValidator = null;

		this.modelA = null;
		this.modelB = null;
		this.threeObjectA = null;
		this.threeObjectB = null;
		this.viewerModelA = null;
		this.viewerModelB = null;

		this.comparator = new ModelComparator ();
		this.comparisonMode = ComparisonMode.Overlay;
		this.isCompared = false;
		this.isVisualized = false;

		this.settings = {
			animationSteps : 40
		};
	}

	Init (canvas)
	{
		this.canvas = canvas;
		this.canvas.id = 'comparisonViewer';

		const parameters = {
			canvas : this.canvas,
			antialias : true
		};

		this.renderer = new THREE.WebGLRenderer (parameters);
		this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

		if (window.devicePixelRatio) {
			this.renderer.setPixelRatio (window.devicePixelRatio);
		}
		this.renderer.setClearColor ('#ffffff', 1.0);
		this.renderer.setSize (this.canvas.width, this.canvas.height);

		this.scene = new THREE.Scene ();
		this.viewerModelA = new ViewerMainModel (this.scene);
		this.viewerModelB = new ViewerMainModel (this.scene);

		this.InitNavigation ();
		this.InitShading ();

		this.Render ();
	}

	SetOverlayOpacity (opacity)
	{
		this.comparator.SetOverlayOpacity (opacity);
	}

	GetOverlayOpacity ()
	{
		return this.comparator.GetOverlayOpacity ();
	}

	SetComparisonMode (mode)
	{
		this.comparisonMode = mode;
		this.UpdateVisualization ();
	}

	GetComparisonMode ()
	{
		return this.comparisonMode;
	}

	SetModelA (model, threeObject)
	{
		this.modelA = model;
		this.threeObjectA = threeObject;
		if (threeObject !== null) {
			this.viewerModelA.SetMainObject (threeObject);
		}
		this.isCompared = false;
		this.isVisualized = false;
		this.UpdateComparator ();
	}

	SetModelB (model, threeObject)
	{
		this.modelB = model;
		this.threeObjectB = threeObject;
		if (threeObject !== null) {
			this.viewerModelB.SetMainObject (threeObject);
		}
		this.isCompared = false;
		this.isVisualized = false;
		this.UpdateComparator ();
	}

	SetModels (modelA, threeObjectA, modelB, threeObjectB)
	{
		this.SetModelA (modelA, threeObjectA);
		this.SetModelB (modelB, threeObjectB);
	}

	UpdateComparator ()
	{
		if (this.modelA !== null && this.modelB !== null &&
			this.threeObjectA !== null && this.threeObjectB !== null) {
			this.comparator.SetModels (
				this.modelA,
				this.modelB,
				this.threeObjectA,
				this.threeObjectB
			);
		}
	}

	Compare ()
	{
		if (this.modelA === null || this.modelB === null) {
			return null;
		}
		this.isCompared = true;
		return this.comparator.Compare ();
	}

	GetDiffInfo ()
	{
		return this.comparator.GetDiffInfo ();
	}

	HasDifferences ()
	{
		return this.comparator.HasDifferences ();
	}

	ApplyDiffVisualization ()
	{
		if (!this.isCompared) {
			this.Compare ();
		}
		this.comparator.RestoreOriginalMaterials ();
		this.isVisualized = true;

		if (this.comparisonMode === ComparisonMode.Overlay) {
			this.comparator.ApplyOverlayMode ();
		} else if (this.comparisonMode === ComparisonMode.DiffOnly) {
			const hasDiffs = this.HasDifferences ();
			if (hasDiffs) {
				this.comparator.ApplyDiffVisualization (DiffType.Removed, DiffType.Added);
			} else {
				this.comparator.ApplyDiffVisualization (DiffType.Identical, DiffType.Identical);
			}
		}

		this.Render ();
	}

	RemoveDiffVisualization ()
	{
		this.comparator.RestoreOriginalMaterials ();
		this.isVisualized = false;
		this.Render ();
	}

	UpdateVisualization ()
	{
		if (this.isVisualized) {
			this.ApplyDiffVisualization ();
		}
	}

	InitNavigation ()
	{
		const camera = GetDefaultCamera (Direction.Y);
		this.camera = new THREE.PerspectiveCamera (45.0, 1.0, 0.1, 1000.0);
		this.projectionMode = 1;
		this.cameraValidator = {
			eyeCenterDistance : 0.0,
			forceUpdate : true,
			ForceUpdate : function () { this.forceUpdate = true; },
			ValidatePerspective : function ()
			{
				if (this.forceUpdate) {
					this.forceUpdate = false;
					return false;
				}
				return true;
			}
		};
		this.scene.add (this.camera);

		const canvasElem = this.renderer.domElement;
		this.navigation = {
			camera : camera,
			navigationMode : 1,
			GetCamera : function () { return this.camera; },
			SetCamera : function (cam) { this.camera = cam; },
			GetNavigationMode : function () { return this.navigationMode; },
			SetNavigationMode : function (mode) { this.navigationMode = mode; },
			MoveCamera : function (newCamera, stepCount) {
				if (newCamera !== null) {
					this.camera = newCamera;
				}
			},
			GetFitToSphereCamera : function (center, radius) {
				return this.camera.Clone ();
			}
		};

		this.upVector = {
			direction : Direction.Y,
			isFixed : true,
			isFlipped : false,
			SetDirection : function (newDirection, oldCamera) {
				this.direction = newDirection;
				return oldCamera.Clone ();
			},
			SetFixed : function (isFixed, oldCamera) {
				this.isFixed = isFixed;
				return oldCamera.Clone ();
			},
			Flip : function (oldCamera) {
				this.isFlipped = !this.isFlipped;
				return oldCamera.Clone ();
			}
		};
	}

	InitShading ()
	{
		this.shadingModel = {
			type : 1,
			scene : this.scene,
			SetEnvironmentMapSettings : function () {},
			SetShadingType : function () {},
			SetProjectionMode : function () {},
			UpdateShading : function () {},
			UpdateByCamera : function () {}
		};

		const ambientLight = new THREE.AmbientLight (0x888888);
		this.scene.add (ambientLight);

		const directionalLight = new THREE.DirectionalLight (0x888888);
		directionalLight.position.set (1.0, 1.0, 1.0);
		this.scene.add (directionalLight);
	}

	Render ()
	{
		const navigationCamera = this.navigation.GetCamera ();
		if (navigationCamera === null) {
			return;
		}

		this.camera.position.set (navigationCamera.eye.x, navigationCamera.eye.y, navigationCamera.eye.z);
		this.camera.up.set (navigationCamera.up.x, navigationCamera.up.y, navigationCamera.up.z);
		this.camera.lookAt (new THREE.Vector3 (navigationCamera.center.x, navigationCamera.center.y, navigationCamera.center.z));

		if (this.projectionMode === 1) {
			if (!this.cameraValidator.ValidatePerspective ()) {
				this.camera.aspect = this.canvas.width / this.canvas.height;
				this.camera.fov = navigationCamera.fov;
				this.camera.updateProjectionMatrix ();
			}
		}

		this.shadingModel.UpdateByCamera (navigationCamera);
		this.renderer.render (this.scene, this.camera);
	}

	Resize (width, height)
	{
		if (window.devicePixelRatio) {
			this.renderer.setPixelRatio (window.devicePixelRatio);
		}
		this.renderer.setSize (width, height);
		this.cameraValidator.ForceUpdate ();
		this.Render ();
	}

	FitSphereToWindow (boundingSphere, animation)
	{
		if (boundingSphere === null) {
			return;
		}

		const center = new Coord3D (boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
		const radius = boundingSphere.radius;
		const newCamera = this.navigation.GetFitToSphereCamera (center, radius);
		this.navigation.MoveCamera (newCamera, animation ? this.settings.animationSteps : 0);
	}

	GetCombinedBoundingSphere ()
	{
		let hasMesh = false;
		let boundingBox = new THREE.Box3 ();

		const processObject = (viewerModel) => {
			if (viewerModel === null) {
				return;
			}
			viewerModel.EnumerateMeshesAndLines ((mesh) => {
				boundingBox.union (new THREE.Box3 ().setFromObject (mesh));
				hasMesh = true;
			});
		};

		processObject (this.viewerModelA);
		processObject (this.viewerModelB);

		if (!hasMesh) {
			return null;
		}

		const boundingSphere = new THREE.Sphere ();
		boundingBox.getBoundingSphere (boundingSphere);
		return boundingSphere;
	}

	FitToWindow (animation = true)
	{
		const boundingSphere = this.GetCombinedBoundingSphere ();
		this.FitSphereToWindow (boundingSphere, animation);
		this.Render ();
	}

	SetModelAVisibility (visible)
	{
		if (this.viewerModelA !== null) {
			this.viewerModelA.EnumerateMeshesAndLines ((mesh) => {
				mesh.visible = visible;
			});
			this.Render ();
		}
	}

	SetModelBVisibility (visible)
	{
		if (this.viewerModelB !== null) {
			this.viewerModelB.EnumerateMeshesAndLines ((mesh) => {
				mesh.visible = visible;
			});
			this.Render ();
		}
	}

	SetBackgroundColor (color)
	{
		const bgColor = new THREE.Color (
			color.r / 255.0,
			color.g / 255.0,
			color.b / 255.0
		);
		const alpha = color.a / 255.0;
		this.renderer.setClearColor (bgColor, alpha);
		this.Render ();
	}

	GetCamera ()
	{
		return this.navigation.GetCamera ();
	}

	SetCamera (camera)
	{
		this.navigation.SetCamera (camera);
		this.cameraValidator.ForceUpdate ();
		this.Render ();
	}

	Clear ()
	{
		if (this.viewerModelA !== null) {
			this.viewerModelA.Clear ();
		}
		if (this.viewerModelB !== null) {
			this.viewerModelB.Clear ();
		}
		this.modelA = null;
		this.modelB = null;
		this.threeObjectA = null;
		this.threeObjectB = null;
		this.isCompared = false;
		this.isVisualized = false;
		this.comparator = new ModelComparator ();
		this.Render ();
	}

	Destroy ()
	{
		this.Clear ();
		if (this.renderer !== null) {
			this.renderer.dispose ();
		}
	}
}
