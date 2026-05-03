import * as THREE from 'three';
import { IntersectionMode } from '../engine/viewer/viewermodel.js';

function GetFaceWorldNormal (intersection)
{
    let normalMatrix = new THREE.Matrix4 ();
    intersection.object.updateWorldMatrix (true, false);
    normalMatrix.extractRotation (intersection.object.matrixWorld);
    let faceNormal = intersection.face.normal.clone ();
    faceNormal.applyMatrix4 (normalMatrix);
    return faceNormal;
}

function CreateMaterial ()
{
    return new THREE.LineBasicMaterial ({
        color : 0x263238,
        depthTest : false
    });
}

function CreateSphereMaterial ()
{
    return new THREE.MeshBasicMaterial ({
        color : 0x2196F3,
        depthTest : false,
        transparent : true,
        opacity : 0.8
    });
}

function CreateLineFromPoints (points, material)
{
    let geometry = new THREE.BufferGeometry ().setFromPoints (points);
    return new THREE.Line (geometry, material);
}

function CreateSphereMarker (radius)
{
    let geometry = new THREE.SphereGeometry (radius, 16, 16);
    let material = CreateSphereMaterial ();
    return new THREE.Mesh (geometry, material);
}

export class Annotation
{
    constructor (id, intersection, radius, note = '')
    {
        this.id = id;
        this.intersection = intersection;
        this.note = note;
        this.markerObject = new THREE.Object3D ();
        this.label = 'Annotation ' + id;

        let material = CreateMaterial ();
        let circleCurve = new THREE.EllipseCurve (0.0, 0.0, radius, radius, 0.0, 2.0 * Math.PI, false, 0.0);
        this.markerObject.add (CreateLineFromPoints (circleCurve.getPoints (50), material));
        this.markerObject.add (CreateSphereMarker (radius * 0.3));

        this.UpdatePosition (intersection);
    }

    UpdatePosition (intersection)
    {
        this.intersection = intersection;
        let faceNormal = GetFaceWorldNormal (this.intersection);
        this.markerObject.updateMatrixWorld (true);
        this.markerObject.position.set (0.0, 0.0, 0.0);
        this.markerObject.lookAt (faceNormal);
        this.markerObject.position.set (this.intersection.point.x, this.intersection.point.y, this.intersection.point.z);
    }

    Show (show)
    {
        this.markerObject.visible = show;
    }

    GetIntersection ()
    {
        return this.intersection;
    }

    GetObject ()
    {
        return this.markerObject;
    }

    SetNote (note)
    {
        this.note = note;
    }

    GetNote ()
    {
        return this.note;
    }

    SetLabel (label)
    {
        this.label = label;
    }

    GetLabel ()
    {
        return this.label;
    }
}

export class AnnotationTool
{
    constructor (viewer, settings)
    {
        this.viewer = viewer;
        this.settings = settings;
        this.isActive = false;
        this.annotations = [];
        this.tempAnnotation = null;
        this.nextId = 1;
        this.button = null;
        this.callbacks = null;
    }

    Init (callbacks)
    {
        this.callbacks = callbacks;
    }

    SetButton (button)
    {
        this.button = button;
    }

    IsActive ()
    {
        return this.isActive;
    }

    SetActive (isActive)
    {
        if (this.isActive === isActive) {
            return;
        }
        this.isActive = isActive;
        this.button.SetSelected (isActive);
        if (this.isActive) {
            this.UpdatePanel ();
        } else {
            this.HideTempMarker ();
        }
    }

    Click (mouseCoordinates)
    {
        let intersection = this.viewer.GetMeshIntersectionUnderMouse (IntersectionMode.MeshOnly, mouseCoordinates);
        if (intersection === null) {
            return;
        }
        this.AddAnnotation (intersection);
    }

    MouseMove (mouseCoordinates)
    {
        let intersection = this.viewer.GetMeshIntersectionUnderMouse (IntersectionMode.MeshOnly, mouseCoordinates);
        if (intersection === null) {
            this.HideTempMarker ();
            return;
        }
        if (this.tempAnnotation === null) {
            this.tempAnnotation = this.GenerateTempAnnotation (intersection);
        }
        this.tempAnnotation.UpdatePosition (intersection);
        this.tempAnnotation.Show (true);
        this.viewer.Render ();
    }

    HideTempMarker ()
    {
        if (this.tempAnnotation !== null) {
            this.tempAnnotation.Show (false);
            this.viewer.Render ();
        }
    }

    AddAnnotation (intersection, note = '')
    {
        let annotation = this.GenerateAnnotation (intersection, note);
        this.annotations.push (annotation);
        this.UpdatePanel ();
        if (this.callbacks && this.callbacks.onAnnotationAdded) {
            this.callbacks.onAnnotationAdded (annotation);
        }
        return annotation;
    }

    RemoveAnnotation (id)
    {
        let index = this.annotations.findIndex (ann => ann.id === id);
        if (index === -1) {
            return false;
        }
        let annotation = this.annotations[index];
        this.viewer.ClearExtra ();
        this.annotations.splice (index, 1);
        this.ReAddAllAnnotations ();
        this.UpdatePanel ();
        if (this.callbacks && this.callbacks.onAnnotationRemoved) {
            this.callbacks.onAnnotationRemoved (annotation);
        }
        return true;
    }

    UpdateAnnotationNote (id, note)
    {
        let annotation = this.annotations.find (ann => ann.id === id);
        if (annotation === undefined) {
            return false;
        }
        annotation.SetNote (note);
        this.UpdatePanel ();
        if (this.callbacks && this.callbacks.onAnnotationUpdated) {
            this.callbacks.onAnnotationUpdated (annotation);
        }
        return true;
    }

    UpdateAnnotationLabel (id, label)
    {
        let annotation = this.annotations.find (ann => ann.id === id);
        if (annotation === undefined) {
            return false;
        }
        annotation.SetLabel (label);
        this.UpdatePanel ();
        if (this.callbacks && this.callbacks.onAnnotationUpdated) {
            this.callbacks.onAnnotationUpdated (annotation);
        }
        return true;
    }

    ReAddAllAnnotations ()
    {
        for (let annotation of this.annotations) {
            this.viewer.AddExtraObject (annotation.GetObject ());
        }
        if (this.tempAnnotation !== null) {
            this.viewer.AddExtraObject (this.tempAnnotation.GetObject ());
        }
    }

    GenerateAnnotation (intersection, note = '')
    {
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return true;
        });

        let radius = boundingSphere.radius / 40.0;
        let annotation = new Annotation (this.nextId++, intersection, radius, note);
        this.viewer.AddExtraObject (annotation.GetObject ());
        return annotation;
    }

    GenerateTempAnnotation (intersection)
    {
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return true;
        });

        let radius = boundingSphere.radius / 40.0;
        let annotation = new Annotation (0, intersection, radius, '');
        this.viewer.AddExtraObject (annotation.GetObject ());
        return annotation;
    }

    UpdatePanel ()
    {
        if (this.callbacks && this.callbacks.onUpdatePanel) {
            this.callbacks.onUpdatePanel (this.annotations);
        }
    }

    GetAnnotations ()
    {
        return this.annotations;
    }

    GetAnnotationById (id)
    {
        return this.annotations.find (ann => ann.id === id);
    }

    ClearAll ()
    {
        this.viewer.ClearExtra ();
        this.annotations = [];
        this.tempAnnotation = null;
        this.nextId = 1;
        this.UpdatePanel ();
    }

    Resize ()
    {
        if (this.callbacks && this.callbacks.onResize) {
            this.callbacks.onResize ();
        }
    }

    FitAnnotationToWindow (id)
    {
        let annotation = this.GetAnnotationById (id);
        if (annotation === undefined) {
            return;
        }
        let intersection = annotation.GetIntersection ();
        let boundingSphere = {
            center : intersection.point.clone (),
            radius : 1.0
        };
        this.viewer.FitSphereToWindow (boundingSphere, true);
    }
}
