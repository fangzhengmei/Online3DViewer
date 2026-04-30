import { Coord3D, CoordDistance3D, SubCoord3D } from '../geometry/coord3d.js';
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
}

export class ClippingPlaneManager
{
    constructor ()
    {
        this.clippingPlanes = [];
        this.isEnabled = true;
    }

    IsEnabled ()
    {
        return this.isEnabled;
    }

    SetEnabled (enabled)
    {
        this.isEnabled = enabled;
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

    AddPlane (axis = ClippingPlaneAxis.Z, offset = 0.0, invert = false)
    {
        let plane = new ClippingPlane (axis, offset, invert);
        this.clippingPlanes.push (plane);
        return this.clippingPlanes.length - 1;
    }

    RemovePlane (index)
    {
        if (index < 0 || index >= this.clippingPlanes.length) {
            return false;
        }
        this.clippingPlanes.splice (index, 1);
        return true;
    }

    RemoveAllPlanes ()
    {
        this.clippingPlanes = [];
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
        return true;
    }

    GetThreePlanes ()
    {
        if (!this.isEnabled) {
            return [];
        }
        return this.clippingPlanes.map (plane => plane.GetThreePlane ());
    }

    Reset ()
    {
        this.clippingPlanes = [];
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

        this.clippingPlaneManager = new ClippingPlaneManager ();

        this.scene = new THREE.Scene ();
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
