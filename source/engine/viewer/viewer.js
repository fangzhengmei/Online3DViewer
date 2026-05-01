import { Coord3D, CoordDistance3D, SubCoord3D, AddCoord3D, CrossVector3D } from '../geometry/coord3d.js';
import { DegRad, Direction, IsEqual } from '../geometry/geometry.js';
import { ColorComponentToFloat } from '../model/color.js';
import { CreateHighlightMaterials, ShadingType } from '../threejs/threeutils.js';
import { Camera, NavigationMode, ProjectionMode } from './camera.js';
import { GetDomElementInnerDimensions } from './domutils.js';
import { Navigation } from './navigation.js';
import { ShadingModel } from './shadingmodel.js';
import { ViewerModel, ViewerMainModel } from './viewermodel.js';

import * as THREE from 'three';

export const ClippingPlaneAxis =
{
    X : 0,
    Y : 1,
    Z : 2
};

export class ClippingPlane
{
    constructor (axis = ClippingPlaneAxis.Z, offset = 0.0, invert = false)
    {
        this.axis = axis;
        this.offset = offset;
        this.invert = invert;
        this.threePlane = this.CreateThreePlane ();
    }

    Clone ()
    {
        return new ClippingPlane (this.axis, this.offset, this.invert);
    }

    CreateThreePlane ()
    {
        let normal = new THREE.Vector3 (0, 0, 1);
        switch (this.axis) {
            case ClippingPlaneAxis.X:
                normal = new THREE.Vector3 (1, 0, 0);
                break;
            case ClippingPlaneAxis.Y:
                normal = new THREE.Vector3 (0, 1, 0);
                break;
            case ClippingPlaneAxis.Z:
                normal = new THREE.Vector3 (0, 0, 1);
                break;
        }
        if (this.invert) {
            normal.negate ();
        }
        return new THREE.Plane (normal, -this.offset);
    }

    SetAxis (axis)
    {
        this.axis = axis;
        this.threePlane = this.CreateThreePlane ();
    }

    SetOffset (offset)
    {
        this.offset = offset;
        this.threePlane.constant = -this.offset;
    }

    SetInvert (invert)
    {
        this.invert = invert;
        this.threePlane = this.CreateThreePlane ();
    }

    GetThreePlane ()
    {
        return this.threePlane;
    }

    GetNormal ()
    {
        return this.threePlane.normal.clone ();
    }

    GetOrigin ()
    {
        return this.threePlane.normal.clone ().multiplyScalar (-this.threePlane.constant);
    }
}

export const ClippingGizmoType =
{
    Plane : 0,
    Arrow : 1
};

export class ClippingPlaneGizmo
{
    constructor (clippingPlane, size = 1.0)
    {
        this.clippingPlane = clippingPlane;
        this.size = size;
        this.isSelected = false;

        this.rootObject = new THREE.Object3D ();
        this.rootObject.userData.gizmoType = ClippingGizmoType.Plane;

        this.planeMesh = null;
        this.arrowMesh = null;
        this.borderLines = null;

        this.CreateGizmo ();
        this.UpdateTransform ();
    }

    CreateGizmo ()
    {
        let planeSize = this.size;
        let halfSize = planeSize / 2;

        let planeGeometry = new THREE.PlaneGeometry (planeSize, planeSize, 10, 10);
        let planeMaterial = new THREE.MeshBasicMaterial ({
            color : 0x00aaff,
            transparent : true,
            opacity : 0.3,
            side : THREE.DoubleSide,
            depthWrite : false
        });
        this.planeMesh = new THREE.Mesh (planeGeometry, planeMaterial);
        this.planeMesh.userData.gizmoType = ClippingGizmoType.Plane;
        this.rootObject.add (this.planeMesh);

        let borderGeometry = new THREE.BufferGeometry ();
        let borderVertices = new Float32Array ([
            -halfSize, -halfSize, 0,
             halfSize, -halfSize, 0,
             halfSize,  halfSize, 0,
            -halfSize,  halfSize, 0,
            -halfSize, -halfSize, 0
        ]);
        borderGeometry.setAttribute ('position', new THREE.BufferAttribute (borderVertices, 3));
        let borderMaterial = new THREE.LineBasicMaterial ({
            color : 0x0088cc,
            transparent : true,
            opacity : 0.8,
            depthWrite : false
        });
        this.borderLines = new THREE.Line (borderGeometry, borderMaterial);
        this.borderLines.userData.gizmoType = ClippingGizmoType.Plane;
        this.rootObject.add (this.borderLines);

        this.CreateArrow ();
    }

    CreateArrow ()
    {
        let arrowLength = this.size * 0.4;
        let arrowHeadLength = arrowLength * 0.3;
        let arrowHeadWidth = arrowLength * 0.15;

        let direction = new THREE.Vector3 (0, 0, 1);
        let origin = new THREE.Vector3 (0, 0, 0);

        let arrowMaterial = new THREE.MeshBasicMaterial ({
            color : 0xff6600,
            transparent : true,
            opacity : 0.9,
            depthWrite : false
        });

        let shaftGeometry = new THREE.CylinderGeometry (
            arrowHeadWidth * 0.3,
            arrowHeadWidth * 0.3,
            arrowLength - arrowHeadLength,
            8
        );
        shaftGeometry.translate (0, (arrowLength - arrowHeadLength) / 2, 0);
        let shaftMesh = new THREE.Mesh (shaftGeometry, arrowMaterial);

        let headGeometry = new THREE.ConeGeometry (
            arrowHeadWidth,
            arrowHeadLength,
            8
        );
        headGeometry.translate (0, arrowLength - arrowHeadLength / 2, 0);
        let headMesh = new THREE.Mesh (headGeometry, arrowMaterial);

        this.arrowMesh = new THREE.Object3D ();
        this.arrowMesh.add (shaftMesh);
        this.arrowMesh.add (headMesh);
        this.arrowMesh.userData.gizmoType = ClippingGizmoType.Arrow;

        let arrowGroup = new THREE.Object3D ();
        arrowGroup.add (this.arrowMesh);
        arrowGroup.rotateX (-Math.PI / 2);

        this.rootObject.add (arrowGroup);
    }

    UpdateTransform ()
    {
        let normal = this.clippingPlane.GetNormal ();
        let origin = this.clippingPlane.GetOrigin ();

        this.rootObject.position.copy (origin);

        let defaultNormal = new THREE.Vector3 (0, 0, 1);
        let quaternion = new THREE.Quaternion ().setFromUnitVectors (defaultNormal, normal);
        this.rootObject.quaternion.copy (quaternion);
    }

    SetSize (size)
    {
        this.size = size;
        this.rootObject.remove (this.planeMesh);
        this.rootObject.remove (this.borderLines);
        this.rootObject.clear ();
        this.CreateGizmo ();
        this.UpdateTransform ();
    }

    SetSelected (selected)
    {
        this.isSelected = selected;
        let color = selected ? 0xffff00 : 0x0088cc;
        if (this.borderLines && this.borderLines.material) {
            this.borderLines.material.color.setHex (color);
        }
        if (this.planeMesh && this.planeMesh.material) {
            this.planeMesh.material.color.setHex (selected ? 0xffff44 : 0x00aaff);
        }
    }

    GetRootObject ()
    {
        return this.rootObject;
    }

    Dispose ()
    {
        if (this.planeMesh) {
            this.planeMesh.geometry.dispose ();
            this.planeMesh.material.dispose ();
        }
        if (this.borderLines) {
            this.borderLines.geometry.dispose ();
            this.borderLines.material.dispose ();
        }
        this.rootObject.clear ();
    }
}

export class ClippingPlaneManager
{
    constructor ()
    {
        this.clippingPlanes = [];
        this.gizmos = [];
        this.isEnabled = true;
        this.scene = null;
        this.defaultGizmoSize = 2.0;
    }

    SetScene (scene)
    {
        this.scene = scene;
    }

    IsEnabled ()
    {
        return this.isEnabled;
    }

    SetEnabled (enabled)
    {
        this.isEnabled = enabled;
        this.UpdateGizmosVisibility ();
    }

    GetPlaneCount ()
    {
        return this.clippingPlanes.length;
    }

    GetPlane (index)
    {
        if (index < 0 || index >= this.clippingPlanes.length) {
            return null;
        }
        return this.clippingPlanes[index];
    }

    GetGizmo (index)
    {
        if (index < 0 || index >= this.gizmos.length) {
            return null;
        }
        return this.gizmos[index];
    }

    AddPlane (axis = ClippingPlaneAxis.Z, offset = 0.0, invert = false)
    {
        let plane = new ClippingPlane (axis, offset, invert);
        this.clippingPlanes.push (plane);

        let gizmo = new ClippingPlaneGizmo (plane, this.defaultGizmoSize);
        this.gizmos.push (gizmo);

        if (this.scene !== null) {
            this.scene.add (gizmo.GetRootObject ());
        }

        return this.clippingPlanes.length - 1;
    }

    RemovePlane (index)
    {
        if (index < 0 || index >= this.clippingPlanes.length) {
            return false;
        }

        let gizmo = this.gizmos[index];
        if (gizmo !== null && this.scene !== null) {
            this.scene.remove (gizmo.GetRootObject ());
            gizmo.Dispose ();
        }

        this.clippingPlanes.splice (index, 1);
        this.gizmos.splice (index, 1);

        return true;
    }

    RemoveAllPlanes ()
    {
        for (let i = this.gizmos.length - 1; i >= 0; i--) {
            this.RemovePlane (i);
        }
    }

    UpdatePlane (index, axis = null, offset = null, invert = null)
    {
        let plane = this.GetPlane (index);
        if (plane === null) {
            return false;
        }
        if (axis !== null) {
            plane.SetAxis (axis);
        }
        if (offset !== null) {
            plane.SetOffset (offset);
        }
        if (invert !== null) {
            plane.SetInvert (invert);
        }

        let gizmo = this.GetGizmo (index);
        if (gizmo !== null) {
            gizmo.UpdateTransform ();
        }

        return true;
    }

    GetThreePlanes ()
    {
        if (!this.isEnabled) {
            return [];
        }
        return this.clippingPlanes.map (plane => plane.GetThreePlane ());
    }

    UpdateGizmosVisibility ()
    {
        for (let gizmo of this.gizmos) {
            if (gizmo !== null && gizmo.GetRootObject () !== null) {
                gizmo.GetRootObject ().visible = this.isEnabled;
            }
        }
    }

    UpdateGizmosSize (boundingSphere)
    {
        if (boundingSphere === null) {
            return;
        }
        let size = boundingSphere.radius * 2.0;
        this.defaultGizmoSize = Math.max (size, 1.0);
        for (let gizmo of this.gizmos) {
            if (gizmo !== null) {
                gizmo.SetSize (this.defaultGizmoSize);
            }
        }
    }

    SetSelectedPlane (index)
    {
        for (let i = 0; i < this.gizmos.length; i++) {
            let gizmo = this.gizmos[i];
            if (gizmo !== null) {
                gizmo.SetSelected (i === index);
            }
        }
    }

    Reset ()
    {
        this.RemoveAllPlanes ();
        this.isEnabled = true;
    }
}

export function GetDefaultCamera (direction)
{
    let fieldOfView = 45.0;
    if (direction === Direction.X) {
        return new Camera (
            new Coord3D (2.0, -3.0, 1.5),
            new Coord3D (0.0, 0.0, 0.0),
            new Coord3D (1.0, 0.0, 0.0),
            fieldOfView
        );
    } else if (direction === Direction.Y) {
        return new Camera (
            new Coord3D (-1.5, 2.0, 3.0),
            new Coord3D (0.0, 0.0, 0.0),
            new Coord3D (0.0, 1.0, 0.0),
            fieldOfView
        );
    } else if (direction === Direction.Z) {
        return new Camera (
            new Coord3D (-1.5, -3.0, 2.0),
            new Coord3D (0.0, 0.0, 0.0),
            new Coord3D (0.0, 0.0, 1.0),
            fieldOfView
        );
    }
    return null;
}

export function TraverseThreeObject (object, processor)
{
    if (!processor (object)) {
        return false;
    }
    for (let child of object.children) {
        if (!TraverseThreeObject (child, processor)) {
            return false;
        }
    }
    return true;
}

export function GetShadingTypeOfObject (mainObject)
{
    let shadingType = null;
    TraverseThreeObject (mainObject, (obj) => {
        if (obj.isMesh) {
            for (const material of obj.material) {
                if (material.type === 'MeshPhongMaterial') {
                    shadingType = ShadingType.Phong;
                } else if (material.type === 'MeshStandardMaterial') {
                    shadingType = ShadingType.Physical;
                }
                return false;
            }
        }
        return true;
    });
    return shadingType;
}

export class CameraValidator
{
    constructor ()
    {
        this.eyeCenterDistance = 0.0;
        this.forceUpdate = true;
    }

    ForceUpdate ()
    {
        this.forceUpdate = true;
    }

    ValidatePerspective ()
    {
        if (this.forceUpdate) {
            this.forceUpdate = false;
            return false;
        }
        return true;
    }

    ValidateOrthographic (eyeCenterDistance)
    {
        if (this.forceUpdate || !IsEqual (this.eyeCenterDistance, eyeCenterDistance)) {
            this.eyeCenterDistance = eyeCenterDistance;
            this.forceUpdate = false;
            return false;
        }
        return true;
    }
}

export class UpVector
{
    constructor ()
    {
        this.direction = Direction.Y;
        this.isFixed = true;
        this.isFlipped = false;
    }

    SetDirection (newDirection, oldCamera)
    {
        this.direction = newDirection;
        this.isFlipped = false;

        let defaultCamera = GetDefaultCamera (this.direction);
        let defaultDir = SubCoord3D (defaultCamera.eye, defaultCamera.center);

        let distance = CoordDistance3D (oldCamera.center, oldCamera.eye);
        let newEye = oldCamera.center.Clone ().Offset (defaultDir, distance);

        let newCamera = oldCamera.Clone ();
        if (this.direction === Direction.X) {
            newCamera.up = new Coord3D (1.0, 0.0, 0.0);
            newCamera.eye = newEye;
        } else if (this.direction === Direction.Y) {
            newCamera.up = new Coord3D (0.0, 1.0, 0.0);
            newCamera.eye = newEye;
        } else if (this.direction === Direction.Z) {
            newCamera.up = new Coord3D (0.0, 0.0, 1.0);
            newCamera.eye = newEye;
        }
        return newCamera;
    }

    SetFixed (isFixed, oldCamera)
    {
        this.isFixed = isFixed;
        if (this.isFixed) {
            return this.SetDirection (this.direction, oldCamera);
        }
        return null;
    }

    Flip (oldCamera)
    {
        this.isFlipped = !this.isFlipped;
        let newCamera = oldCamera.Clone ();
        newCamera.up.MultiplyScalar (-1.0);
        return newCamera;
    }
}

export class Viewer
{
    constructor ()
    {
        THREE.ColorManagement.enabled = false;

        this.canvas = null;
        this.renderer = null;
        this.scene = null;
        this.mainModel = null;
        this.extraModel = null;
        this.camera = null;
        this.projectionMode = null;
        this.cameraValidator = null;
        this.shadingModel = null;
        this.navigation = null;
        this.upVector = null;
        this.clippingPlaneManager = null;
        this.settings = {
            animationSteps : 40
        };

        this.clippingInteraction = {
            isDragging : false,
            selectedPlaneIndex : -1,
            dragStartMouse : null,
            dragStartOffset : 0.0,
            dragPlane : null,
            dragIntersection : null
        };
    }

    Init (canvas)
    {
        this.canvas = canvas;
        this.canvas.id = 'viewer';

        let parameters = {
            canvas : this.canvas,
            antialias : true
        };

        this.renderer = new THREE.WebGLRenderer (parameters);
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        this.renderer.localClippingEnabled = true;

        if (window.devicePixelRatio) {
            this.renderer.setPixelRatio (window.devicePixelRatio);
        }
        this.renderer.setClearColor ('#ffffff', 1.0);
        this.renderer.setSize (this.canvas.width, this.canvas.height);

        this.scene = new THREE.Scene ();
        this.clippingPlaneManager = new ClippingPlaneManager ();
        this.clippingPlaneManager.SetScene (this.scene);

        this.mainModel = new ViewerMainModel (this.scene);
        this.extraModel = new ViewerModel (this.scene);

        this.InitNavigation ();
        this.InitShading ();

        this.Render ();
    }

    SetMouseClickHandler (onMouseClick)
    {
        this.navigation.SetMouseClickHandler (onMouseClick);
    }

    SetMouseMoveHandler (onMouseMove)
    {
        this.navigation.SetMouseMoveHandler (onMouseMove);
    }

    SetContextMenuHandler (onContext)
    {
        this.navigation.SetContextMenuHandler (onContext);
    }

    SetEdgeSettings (edgeSettings)
    {
        let newEdgeSettings = edgeSettings.Clone ();
        this.mainModel.SetEdgeSettings (newEdgeSettings);
        this.Render ();
    }

    SetEnvironmentMapSettings (environmentSettings)
    {
        let newEnvironmentSettings = environmentSettings.Clone ();
        this.shadingModel.SetEnvironmentMapSettings (newEnvironmentSettings, () => {
            this.Render ();
        });
        this.shadingModel.UpdateShading ();
        this.Render ();
    }

    SetBackgroundColor (color)
    {
        let bgColor = new THREE.Color (
            ColorComponentToFloat (color.r),
            ColorComponentToFloat (color.g),
            ColorComponentToFloat (color.b)
        );
        let alpha = ColorComponentToFloat (color.a);
        this.renderer.setClearColor (bgColor, alpha);
        this.Render ();
    }

    GetCanvas ()
    {
        return this.canvas;
    }

    GetCamera ()
    {
        return this.navigation.GetCamera ();
    }

    GetProjectionMode ()
    {
        return this.projectionMode;
    }

    SetCamera (camera)
    {
        this.navigation.SetCamera (camera);
        this.cameraValidator.ForceUpdate ();
        this.Render ();
    }

    SetProjectionMode (projectionMode)
    {
        if (this.projectionMode === projectionMode) {
            return;
        }

        this.scene.remove (this.camera);
        if (projectionMode === ProjectionMode.Perspective) {
            this.camera = new THREE.PerspectiveCamera (45.0, 1.0, 0.1, 1000.0);
        } else if (projectionMode === ProjectionMode.Orthographic) {
			this.camera = new THREE.OrthographicCamera (-1.0, 1.0, 1.0, -1.0, 0.1, 1000.0);
        }
        this.scene.add (this.camera);

        this.projectionMode = projectionMode;
        this.shadingModel.SetProjectionMode (projectionMode);
        this.cameraValidator.ForceUpdate ();

        this.AdjustClippingPlanes ();
        this.Render ();
    }

    Resize (width, height)
    {
        let innerSize = GetDomElementInnerDimensions (this.canvas, width, height);
        this.ResizeRenderer (innerSize.width, innerSize.height);
    }

    ResizeRenderer (width, height)
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
        let center = new Coord3D (boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z);
        let radius = boundingSphere.radius;

        let newCamera = this.navigation.GetFitToSphereCamera (center, radius);
        this.navigation.MoveCamera (newCamera, animation ? this.settings.animationSteps : 0);
    }

    AdjustClippingPlanes ()
    {
        let boundingSphere = this.GetBoundingSphere ((meshUserData) => {
            return true;
        });
        this.AdjustClippingPlanesToSphere (boundingSphere);
    }

    AdjustClippingPlanesToSphere (boundingSphere)
    {
        if (boundingSphere === null) {
            return;
        }
        if (boundingSphere.radius < 10.0) {
            this.camera.near = 0.01;
            this.camera.far = 100.0;
        } else if (boundingSphere.radius < 100.0) {
            this.camera.near = 0.1;
            this.camera.far = 1000.0;
        } else if (boundingSphere.radius < 1000.0) {
            this.camera.near = 10.0;
            this.camera.far = 10000.0;
        } else {
            this.camera.near = 100.0;
            this.camera.far = 1000000.0;
        }

        this.cameraValidator.ForceUpdate ();
        this.Render ();
    }

    GetNavigationMode ()
    {
        return this.navigation.GetNavigationMode ();
    }

    SetNavigationMode (navigationMode)
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.SetFixed (navigationMode === NavigationMode.FixedUpVector, oldCamera);
        this.navigation.SetNavigationMode (navigationMode);
        if (newCamera !== null) {
            this.navigation.MoveCamera (newCamera, this.settings.animationSteps);
        }
        this.Render ();
    }

    SetUpVector (upDirection, animate)
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.SetDirection (upDirection, oldCamera);
        let animationSteps = animate ? this.settings.animationSteps : 0;
        this.navigation.MoveCamera (newCamera, animationSteps);
        this.Render ();
    }

    FlipUpVector ()
    {
        let oldCamera = this.navigation.GetCamera ();
        let newCamera = this.upVector.Flip (oldCamera);
        this.navigation.MoveCamera (newCamera, 0);
        this.Render ();
    }

    Render ()
    {
        let navigationCamera = this.navigation.GetCamera ();

        this.camera.position.set (navigationCamera.eye.x, navigationCamera.eye.y, navigationCamera.eye.z);
        this.camera.up.set (navigationCamera.up.x, navigationCamera.up.y, navigationCamera.up.z);
        this.camera.lookAt (new THREE.Vector3 (navigationCamera.center.x, navigationCamera.center.y, navigationCamera.center.z));

        if (this.projectionMode === ProjectionMode.Perspective) {
            if (!this.cameraValidator.ValidatePerspective ()) {
                this.camera.aspect = this.canvas.width / this.canvas.height;
                this.camera.fov = navigationCamera.fov;
                this.camera.updateProjectionMatrix ();
            }
        } else if (this.projectionMode === ProjectionMode.Orthographic) {
            let eyeCenterDistance = CoordDistance3D (navigationCamera.eye, navigationCamera.center);
            if (!this.cameraValidator.ValidateOrthographic (eyeCenterDistance)) {
                let aspect = this.canvas.width / this.canvas.height;
                let eyeCenterDistance = CoordDistance3D (navigationCamera.eye, navigationCamera.center);
                let frustumHalfHeight = eyeCenterDistance * Math.tan (0.5 * navigationCamera.fov * DegRad);
                this.camera.left = -frustumHalfHeight * aspect;
                this.camera.right = frustumHalfHeight * aspect;
                this.camera.top = frustumHalfHeight;
                this.camera.bottom = -frustumHalfHeight;
                this.camera.updateProjectionMatrix ();
            }
        }

        this.shadingModel.UpdateByCamera (navigationCamera);
        this.renderer.render (this.scene, this.camera);
    }

    SetMainObject (object)
    {
        const shadingType = GetShadingTypeOfObject (object);
        this.mainModel.SetMainObject (object);
        this.shadingModel.SetShadingType (shadingType);
        this.ApplyClippingPlanesToMaterials ();

        let boundingSphere = this.GetBoundingSphere ((meshUserData) => {
            return true;
        });
        this.clippingPlaneManager.UpdateGizmosSize (boundingSphere);

        this.Render ();
    }

    ApplyClippingPlanesToMaterials ()
    {
        let clippingPlanes = this.clippingPlaneManager.GetThreePlanes ();
        this.mainModel.EnumerateMeshesAndLines ((mesh) => {
            if (Array.isArray (mesh.material)) {
                for (let material of mesh.material) {
                    if (material.isMeshPhongMaterial || material.isMeshStandardMaterial) {
                        material.clippingPlanes = clippingPlanes;
                    }
                }
            } else {
                if (mesh.material.isMeshPhongMaterial || mesh.material.isMeshStandardMaterial) {
                    mesh.material.clippingPlanes = clippingPlanes;
                }
            }
        });
    }

    GetClippingPlaneManager ()
    {
        return this.clippingPlaneManager;
    }

    SetClippingEnabled (enabled)
    {
        this.clippingPlaneManager.SetEnabled (enabled);
        this.ApplyClippingPlanesToMaterials ();
        this.Render ();
    }

    IsClippingEnabled ()
    {
        return this.clippingPlaneManager.IsEnabled ();
    }

    AddClippingPlane (axis = ClippingPlaneAxis.Z, offset = 0.0, invert = false)
    {
        let index = this.clippingPlaneManager.AddPlane (axis, offset, invert);
        this.ApplyClippingPlanesToMaterials ();
        this.Render ();
        return index;
    }

    RemoveClippingPlane (index)
    {
        let result = this.clippingPlaneManager.RemovePlane (index);
        if (result) {
            this.ApplyClippingPlanesToMaterials ();
            this.Render ();
        }
        return result;
    }

    RemoveAllClippingPlanes ()
    {
        this.clippingPlaneManager.RemoveAllPlanes ();
        this.ApplyClippingPlanesToMaterials ();
        this.Render ();
    }

    UpdateClippingPlane (index, axis = null, offset = null, invert = null)
    {
        let result = this.clippingPlaneManager.UpdatePlane (index, axis, offset, invert);
        if (result) {
            this.ApplyClippingPlanesToMaterials ();
            this.Render ();
        }
        return result;
    }

    GetClippingPlaneCount ()
    {
        return this.clippingPlaneManager.GetPlaneCount ();
    }

    GetClippingPlane (index)
    {
        return this.clippingPlaneManager.GetPlane (index);
    }

    ResetClippingPlanes ()
    {
        this.EndClippingDrag ();
        this.clippingInteraction.selectedPlaneIndex = -1;
        this.clippingPlaneManager.SetSelectedPlane (-1);
        this.clippingPlaneManager.Reset ();
        this.ApplyClippingPlanesToMaterials ();
        this.Render ();
    }

    AddExtraObject (object)
    {
        this.extraModel.AddObject (object);
        this.Render ();
    }

    Clear ()
    {
        this.mainModel.Clear ();
        this.extraModel.Clear ();
        this.ResetClippingPlanes ();
    }

    ClearExtra ()
    {
        this.extraModel.Clear ();
        this.Render ();
    }

    SetMeshesVisibility (isVisible)
    {
        this.mainModel.EnumerateMeshesAndLines ((mesh) => {
            let visible = isVisible (mesh.userData);
            if (mesh.visible !== visible) {
                mesh.visible = visible;
            }
        });
        this.mainModel.EnumerateEdges ((edge) => {
            let visible = isVisible (edge.userData);
            if (edge.visible !== visible) {
                edge.visible = visible;
            }
        });
        this.Render ();
    }

    SetMeshesHighlight (highlightColor, isHighlighted)
    {
        let withPolygonOffset = this.mainModel.HasLinesOrEdges ();
        this.mainModel.EnumerateMeshesAndLines ((mesh) => {
            let highlighted = isHighlighted (mesh.userData);
            if (highlighted) {
                if (mesh.userData.threeMaterials === null) {
                    mesh.userData.threeMaterials = mesh.material;
                    mesh.material = CreateHighlightMaterials (mesh.userData.threeMaterials, highlightColor, withPolygonOffset);
                }
            } else {
                if (mesh.userData.threeMaterials !== null) {
                    mesh.material = mesh.userData.threeMaterials;
                    mesh.userData.threeMaterials = null;
                }
            }
        });

        this.Render ();
    }

    GetMeshUserDataUnderMouse (intersectionMode, mouseCoords)
    {
        let intersection = this.GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords);
        if (intersection === null) {
            return null;
        }
        return intersection.object.userData;
    }

    GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords)
    {
        let canvasSize = this.GetCanvasSize ();
        let intersection = this.mainModel.GetMeshIntersectionUnderMouse (intersectionMode, mouseCoords, this.camera, canvasSize.width, canvasSize.height);
        if (intersection === null) {
            return null;
        }
        return intersection;
    }

    GetBoundingBox (needToProcess)
    {
        return this.mainModel.GetBoundingBox (needToProcess);
    }

    GetBoundingSphere (needToProcess)
    {
        return this.mainModel.GetBoundingSphere (needToProcess);
    }

    EnumerateMeshesAndLinesUserData (enumerator)
    {
        this.mainModel.EnumerateMeshesAndLines ((mesh) => {
            enumerator (mesh.userData);
        });
    }

    GetClippingGizmoIntersection (mouseCoords)
    {
        if (!this.clippingPlaneManager.IsEnabled ()) {
            return null;
        }

        let canvasSize = this.GetCanvasSize ();
        let mousePos = new THREE.Vector2 ();
        mousePos.x = (mouseCoords.x / canvasSize.width) * 2 - 1;
        mousePos.y = -(mouseCoords.y / canvasSize.height) * 2 + 1;

        let raycaster = new THREE.Raycaster ();
        raycaster.setFromCamera (mousePos, this.camera);

        for (let i = 0; i < this.clippingPlaneManager.GetPlaneCount (); i++) {
            let gizmo = this.clippingPlaneManager.GetGizmo (i);
            if (gizmo === null) {
                continue;
            }
            let gizmoRoot = gizmo.GetRootObject ();
            if (!gizmoRoot.visible) {
                continue;
            }

            let intersections = raycaster.intersectObject (gizmoRoot, true);
            if (intersections.length > 0) {
                return {
                    planeIndex : i,
                    intersection : intersections[0]
                };
            }
        }

        return null;
    }

    GetSelectedClippingPlaneIndex ()
    {
        return this.clippingInteraction.selectedPlaneIndex;
    }

    SetSelectedClippingPlane (index)
    {
        if (index < 0 || index >= this.clippingPlaneManager.GetPlaneCount ()) {
            index = -1;
        }
        this.clippingInteraction.selectedPlaneIndex = index;
        this.clippingPlaneManager.SetSelectedPlane (index);
        this.Render ();
    }

    StartClippingDrag (mouseCoords, gizmoIntersection)
    {
        let planeIndex = gizmoIntersection.planeIndex;
        let clippingPlane = this.clippingPlaneManager.GetPlane (planeIndex);
        if (clippingPlane === null) {
            return false;
        }

        this.clippingInteraction.isDragging = true;
        this.clippingInteraction.selectedPlaneIndex = planeIndex;
        this.clippingInteraction.dragStartMouse = mouseCoords.Clone ();
        this.clippingInteraction.dragStartOffset = clippingPlane.offset;
        this.clippingInteraction.dragIntersection = gizmoIntersection.intersection;

        let planeNormal = clippingPlane.GetNormal ();
        let planeOrigin = clippingPlane.GetOrigin ();
        this.clippingInteraction.dragPlane = new THREE.Plane ().setFromNormalAndCoplanarPoint (
            planeNormal,
            planeOrigin
        );

        this.clippingPlaneManager.SetSelectedPlane (planeIndex);
        this.Render ();
        return true;
    }

    UpdateClippingDrag (mouseCoords)
    {
        if (!this.clippingInteraction.isDragging) {
            return false;
        }

        let planeIndex = this.clippingInteraction.selectedPlaneIndex;
        let clippingPlane = this.clippingPlaneManager.GetPlane (planeIndex);
        if (clippingPlane === null) {
            return false;
        }

        let canvasSize = this.GetCanvasSize ();
        let mousePos = new THREE.Vector2 ();
        mousePos.x = (mouseCoords.x / canvasSize.width) * 2 - 1;
        mousePos.y = -(mouseCoords.y / canvasSize.height) * 2 + 1;

        let raycaster = new THREE.Raycaster ();
        raycaster.setFromCamera (mousePos, this.camera);

        let dragPlane = this.clippingInteraction.dragPlane;
        let intersectionPoint = new THREE.Vector3 ();
        raycaster.ray.intersectPlane (dragPlane, intersectionPoint);

        if (intersectionPoint === null || !intersectionPoint.isFinite ()) {
            return false;
        }

        let planeNormal = clippingPlane.GetNormal ();
        let startIntersection = this.clippingInteraction.dragIntersection.point;
        let delta = intersectionPoint.clone ().sub (startIntersection);
        let offsetDelta = delta.dot (planeNormal);

        let newOffset = this.clippingInteraction.dragStartOffset + offsetDelta;
        this.UpdateClippingPlane (planeIndex, null, newOffset, null);

        return true;
    }

    EndClippingDrag ()
    {
        if (!this.clippingInteraction.isDragging) {
            return;
        }

        this.clippingInteraction.isDragging = false;
        this.clippingInteraction.dragStartMouse = null;
        this.clippingInteraction.dragPlane = null;
        this.clippingInteraction.dragIntersection = null;
    }

    IsClippingDragActive ()
    {
        return this.clippingInteraction.isDragging;
    }

    InitNavigation ()
    {
        let camera = GetDefaultCamera (Direction.Y);
        this.camera = new THREE.PerspectiveCamera (45.0, 1.0, 0.1, 1000.0);
        this.projectionMode = ProjectionMode.Perspective;
        this.cameraValidator = new CameraValidator ();
        this.scene.add (this.camera);

        let canvasElem = this.renderer.domElement;
        this.navigation = new Navigation (canvasElem, camera, {
            onUpdate : () => {
                this.Render ();
            }
        });

        this.upVector = new UpVector ();
    }

    InitShading  ()
    {
        this.shadingModel = new ShadingModel (this.scene);
    }

    GetShadingType ()
    {
        return this.shadingModel.type;
    }

    GetImageSize ()
    {
        let originalSize = new THREE.Vector2 ();
        this.renderer.getSize (originalSize);
        return {
            width : parseInt (originalSize.x, 10),
            height : parseInt (originalSize.y, 10)
        };
    }

    GetCanvasSize ()
    {
        let width = this.canvas.width;
        let height = this.canvas.height;
        if (window.devicePixelRatio) {
            width /= window.devicePixelRatio;
            height /= window.devicePixelRatio;
        }
        return {
            width : width,
            height : height
        };
    }

    GetImageAsDataUrl (width, height, isTransparent)
    {
        let originalSize = this.GetImageSize ();
        let renderWidth = width;
        let renderHeight = height;
        if (window.devicePixelRatio) {
            renderWidth /= window.devicePixelRatio;
            renderHeight /= window.devicePixelRatio;
        }
        let clearAlpha = this.renderer.getClearAlpha ();
        if (isTransparent) {
            this.renderer.setClearAlpha (0.0);
        }
        this.ResizeRenderer (renderWidth, renderHeight);
        this.Render ();
        let url = this.renderer.domElement.toDataURL ();
        this.ResizeRenderer (originalSize.width, originalSize.height);
        this.renderer.setClearAlpha (clearAlpha);
        return url;
    }

    Destroy ()
    {
        this.Clear ();
        this.renderer.dispose ();
    }
}
