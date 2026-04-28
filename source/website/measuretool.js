import { BigEps, IsEqualEps, RadDeg } from '../engine/geometry/geometry.js';
import { AddDiv, ClearDomElement, CreateDiv } from '../engine/viewer/domutils.js';
import { AddSvgIconElement, IsDarkTextNeededForColor } from './utils.js';
import { Loc } from '../engine/core/localization.js';

import * as THREE from 'three';
import { ColorComponentToFloat, RGBColor } from '../engine/model/color.js';
import { IntersectionMode } from '../engine/viewer/viewermodel.js';

export const MeasureMode =
{
    Distance : 'distance',
    Angle : 'angle'
};

function GetFaceWorldNormal (intersection)
{
    let normalMatrix = new THREE.Matrix4 ();
    intersection.object.updateWorldMatrix (true, false);
    normalMatrix.extractRotation (intersection.object.matrixWorld);
    let faceNormal = intersection.face.normal.clone ();
    faceNormal.applyMatrix4 (normalMatrix);
    return faceNormal;
}

function CreateMaterial (color = 0x263238)
{
    return new THREE.LineBasicMaterial ({
        color : color,
        depthTest : false
    });
}

function CreateLineFromPoints (points, material)
{
    let geometry = new THREE.BufferGeometry ().setFromPoints (points);
    return new THREE.Line (geometry, material);
}

function CreateArcGeometry (center, startPoint, endPoint, angle, segments = 32)
{
    const points = [];
    const v1 = new THREE.Vector3 ().subVectors (startPoint, center).normalize ();
    const v2 = new THREE.Vector3 ().subVectors (endPoint, center).normalize ();

    const axis = new THREE.Vector3 ().crossVectors (v1, v2).normalize ();

    const radius = startPoint.distanceTo (center);
    const angleStep = angle / segments;

    for (let i = 0; i <= segments; i++) {
        const currentAngle = i * angleStep;
        const rotationMatrix = new THREE.Matrix4 ().makeRotationAxis (axis, currentAngle);
        const point = v1.clone ().applyMatrix4 (rotationMatrix).multiplyScalar (radius).add (center);
        points.push (point);
    }

    return points;
}

class Marker
{
    constructor (intersection, radius, color = 0x263238)
    {
        this.intersection = null;
        this.markerObject = new THREE.Object3D ();
        this.color = color;

        let material = CreateMaterial (color);
        let circleCurve = new THREE.EllipseCurve (0.0, 0.0, radius, radius, 0.0, 2.0 * Math.PI, false, 0.0);
        this.markerObject.add (CreateLineFromPoints (circleCurve.getPoints (50), material));
        this.markerObject.add (CreateLineFromPoints ([new THREE.Vector3 (-radius, 0.0, 0.0), new THREE.Vector3 (radius, 0.0, 0.0)], material));
        this.markerObject.add (CreateLineFromPoints ([new THREE.Vector3 (0.0, -radius, 0.0), new THREE.Vector3 (0.0, radius, 0.0)], material));

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
}

class Annotation
{
    constructor (text, position, color = '#000000', backgroundColor = 'rgba(255, 255, 255, 0.9)')
    {
        this.text = text;
        this.position = position.clone ();
        this.color = color;
        this.backgroundColor = backgroundColor;
        this.domElement = null;
        this.offset = new THREE.Vector2 (8, -8);
        this.visible = true;

        this.CreateDomElement ();
    }

    CreateDomElement ()
    {
        this.domElement = CreateDiv ('ov_measure_annotation');
        this.domElement.style.position = 'absolute';
        this.domElement.style.pointerEvents = 'none';
        this.domElement.style.zIndex = '1000';
        this.domElement.style.fontFamily = 'Arial, sans-serif';
        this.domElement.style.fontSize = '13px';
        this.domElement.style.fontWeight = 'bold';
        this.domElement.style.color = this.color;
        this.domElement.style.backgroundColor = this.backgroundColor;
        this.domElement.style.padding = '3px 8px';
        this.domElement.style.borderRadius = '4px';
        this.domElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        this.domElement.style.whiteSpace = 'nowrap';
        this.domElement.textContent = this.text;
        document.body.appendChild (this.domElement);
    }

    UpdateText (text)
    {
        this.text = text;
        if (this.domElement) {
            this.domElement.textContent = text;
        }
    }

    UpdatePosition (position)
    {
        this.position = position.clone ();
    }

    SetOffset (x, y)
    {
        this.offset.set (x, y);
    }

    Show (show)
    {
        this.visible = show;
        if (this.domElement) {
            this.domElement.style.display = show ? 'block' : 'none';
        }
    }

    UpdateScreenPosition (camera, canvasRect)
    {
        if (!this.domElement || !this.visible) {
            return;
        }

        const screenPos = this.position.clone ().project (camera);
        const x = (screenPos.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left + this.offset.x;
        const y = (-screenPos.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top + this.offset.y;

        const inFront = screenPos.z < 1;
        const onScreen = x >= canvasRect.left && x <= canvasRect.right && y >= canvasRect.top && y <= canvasRect.bottom;

        if (inFront && onScreen) {
            this.domElement.style.display = 'block';
            this.domElement.style.left = x + 'px';
            this.domElement.style.top = y + 'px';
        } else {
            this.domElement.style.display = 'none';
        }
    }

    Remove ()
    {
        if (this.domElement && this.domElement.parentNode) {
            this.domElement.parentNode.removeChild (this.domElement);
        }
        this.domElement = null;
    }
}

class DistanceMeasurement
{
    constructor (startMarker, endMarker, viewer, color = 0x263238)
    {
        this.startMarker = startMarker;
        this.endMarker = endMarker;
        this.viewer = viewer;
        this.color = color;
        this.lineObject = null;
        this.annotation = null;
        this.objects = [];

        this.CreateLine ();
        this.CreateAnnotation ();
    }

    CreateLine ()
    {
        const material = CreateMaterial (this.color);
        const startPoint = this.startMarker.GetIntersection ().point;
        const endPoint = this.endMarker.GetIntersection ().point;
        this.lineObject = CreateLineFromPoints ([startPoint, endPoint], material);
        this.viewer.AddExtraObject (this.lineObject);
        this.objects.push (this.lineObject);
    }

    CreateAnnotation ()
    {
        const startPoint = this.startMarker.GetIntersection ().point;
        const endPoint = this.endMarker.GetIntersection ().point;
        const distance = startPoint.distanceTo (endPoint);

        const midPoint = new THREE.Vector3 ().addVectors (startPoint, endPoint).multiplyScalar (0.5);

        this.annotation = new Annotation (
            distance.toFixed (3),
            midPoint,
            '#000000',
            'rgba(255, 255, 255, 0.9)'
        );
    }

    GetDistance ()
    {
        const startPoint = this.startMarker.GetIntersection ().point;
        const endPoint = this.endMarker.GetIntersection ().point;
        return startPoint.distanceTo (endPoint);
    }

    UpdateAnnotations (camera, canvasRect)
    {
        if (this.annotation) {
            const startPoint = this.startMarker.GetIntersection ().point;
            const endPoint = this.endMarker.GetIntersection ().point;
            const midPoint = new THREE.Vector3 ().addVectors (startPoint, endPoint).multiplyScalar (0.5);
            this.annotation.UpdatePosition (midPoint);
            this.annotation.UpdateScreenPosition (camera, canvasRect);
        }
    }

    GetObjects ()
    {
        return this.objects;
    }

    Remove ()
    {
        if (this.annotation) {
            this.annotation.Remove ();
            this.annotation = null;
        }
    }
}

class AngleMeasurement
{
    constructor (vertexMarker, point1Marker, point2Marker, viewer, color = 0x263238)
    {
        this.vertexMarker = vertexMarker;
        this.point1Marker = point1Marker;
        this.point2Marker = point2Marker;
        this.viewer = viewer;
        this.color = color;
        this.lineObjects = [];
        this.arcObject = null;
        this.annotation = null;
        this.objects = [];

        this.CreateLines ();
        this.CreateArc ();
        this.CreateAnnotation ();
    }

    CreateLines ()
    {
        const material = CreateMaterial (this.color);
        const vertexPoint = this.vertexMarker.GetIntersection ().point;
        const point1 = this.point1Marker.GetIntersection ().point;
        const point2 = this.point2Marker.GetIntersection ().point;

        const line1 = CreateLineFromPoints ([vertexPoint, point1], material);
        const line2 = CreateLineFromPoints ([vertexPoint, point2], material);

        this.viewer.AddExtraObject (line1);
        this.viewer.AddExtraObject (line2);
        this.lineObjects.push (line1, line2);
        this.objects.push (line1, line2);
    }

    CreateArc ()
    {
        const material = CreateMaterial (this.color);
        const vertexPoint = this.vertexMarker.GetIntersection ().point;
        const point1 = this.point1Marker.GetIntersection ().point;
        const point2 = this.point2Marker.GetIntersection ().point;

        const v1 = new THREE.Vector3 ().subVectors (point1, vertexPoint);
        const v2 = new THREE.Vector3 ().subVectors (point2, vertexPoint);

        const len1 = v1.length ();
        const len2 = v2.length ();
        const arcRadius = Math.min (len1, len2) * 0.3;

        const arcStart = vertexPoint.clone ().add (v1.clone ().normalize ().multiplyScalar (arcRadius));
        const arcEnd = vertexPoint.clone ().add (v2.clone ().normalize ().multiplyScalar (arcRadius));

        const angle = v1.angleTo (v2);

        const arcPoints = CreateArcGeometry (vertexPoint, arcStart, arcEnd, angle, 32);
        this.arcObject = CreateLineFromPoints (arcPoints, material);
        this.viewer.AddExtraObject (this.arcObject);
        this.objects.push (this.arcObject);
    }

    CreateAnnotation ()
    {
        const vertexPoint = this.vertexMarker.GetIntersection ().point;
        const point1 = this.point1Marker.GetIntersection ().point;
        const point2 = this.point2Marker.GetIntersection ().point;

        const v1 = new THREE.Vector3 ().subVectors (point1, vertexPoint);
        const v2 = new THREE.Vector3 ().subVectors (point2, vertexPoint);

        const angle = v1.angleTo (v2);
        const angleDeg = angle * RadDeg;

        const v1Normalized = v1.clone ().normalize ();
        const v2Normalized = v2.clone ().normalize ();
        const bisector = new THREE.Vector3 ().addVectors (v1Normalized, v2Normalized).normalize ();

        const len1 = v1.length ();
        const len2 = v2.length ();
        const labelDistance = Math.min (len1, len2) * 0.5;

        const labelPosition = vertexPoint.clone ().add (bisector.multiplyScalar (labelDistance));

        this.annotation = new Annotation (
            angleDeg.toFixed (1) + '\xB0',
            labelPosition,
            '#000000',
            'rgba(255, 255, 255, 0.9)'
        );
    }

    GetAngle ()
    {
        const vertexPoint = this.vertexMarker.GetIntersection ().point;
        const point1 = this.point1Marker.GetIntersection ().point;
        const point2 = this.point2Marker.GetIntersection ().point;

        const v1 = new THREE.Vector3 ().subVectors (point1, vertexPoint);
        const v2 = new THREE.Vector3 ().subVectors (point2, vertexPoint);

        return v1.angleTo (v2);
    }

    UpdateAnnotations (camera, canvasRect)
    {
        if (this.annotation) {
            const vertexPoint = this.vertexMarker.GetIntersection ().point;
            const point1 = this.point1Marker.GetIntersection ().point;
            const point2 = this.point2Marker.GetIntersection ().point;

            const v1 = new THREE.Vector3 ().subVectors (point1, vertexPoint);
            const v2 = new THREE.Vector3 ().subVectors (point2, vertexPoint);

            const v1Normalized = v1.clone ().normalize ();
            const v2Normalized = v2.clone ().normalize ();
            const bisector = new THREE.Vector3 ().addVectors (v1Normalized, v2Normalized).normalize ();

            const len1 = v1.length ();
            const len2 = v2.length ();
            const labelDistance = Math.min (len1, len2) * 0.5;

            const labelPosition = vertexPoint.clone ().add (bisector.multiplyScalar (labelDistance));
            this.annotation.UpdatePosition (labelPosition);
            this.annotation.UpdateScreenPosition (camera, canvasRect);
        }
    }

    GetObjects ()
    {
        return this.objects;
    }

    Remove ()
    {
        if (this.annotation) {
            this.annotation.Remove ();
            this.annotation = null;
        }
    }
}

function CalculateMarkerValues (aMarker, bMarker)
{
    const aIntersection = aMarker.GetIntersection ();
    const bIntersection = bMarker.GetIntersection ();
    let result = {
        pointsDistance : null,
        parallelFacesDistance : null,
        facesAngle : null
    };

    const aNormal = GetFaceWorldNormal (aIntersection);
    const bNormal = GetFaceWorldNormal (bIntersection);
    result.pointsDistance = aIntersection.point.distanceTo (bIntersection.point);
    result.facesAngle = aNormal.angleTo (bNormal);
    if (IsEqualEps (result.facesAngle, 0.0, BigEps) || IsEqualEps (result.facesAngle, Math.PI, BigEps)) {
        let aPlane = new THREE.Plane ().setFromNormalAndCoplanarPoint (aNormal, aIntersection.point);
        result.parallelFacesDistance = Math.abs (aPlane.distanceToPoint (bIntersection.point));
    }
    return result;
}

export class MeasureTool
{
    constructor (viewer, settings)
    {
        this.viewer = viewer;
        this.settings = settings;
        this.isActive = false;
        this.mode = MeasureMode.Distance;
        this.markers = [];
        this.tempMarker = null;
        this.measurements = [];

        this.panel = null;
        this.button = null;
    }

    SetButton (button)
    {
        this.button = button;
    }

    SetMode (mode)
    {
        if (this.mode === mode) {
            return;
        }
        this.mode = mode;
        this.ClearMarkers ();
        this.UpdatePanel ();
    }

    GetMode ()
    {
        return this.mode;
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
            this.panel = AddDiv (document.body, 'ov_measure_panel');
            this.UpdatePanel ();
            this.Resize ();
        } else {
            this.ClearAllMeasurements ();
            this.panel.remove ();
        }
    }

    GetRequiredPointCount ()
    {
        if (this.mode === MeasureMode.Distance) {
            return 2;
        } else if (this.mode === MeasureMode.Angle) {
            return 3;
        }
        return 2;
    }

    GetMarkerRadius ()
    {
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return true;
        });
        if (boundingSphere === null) {
            return 0.1;
        }
        return boundingSphere.radius / 20.0;
    }

    Click (mouseCoordinates)
    {
        let intersection = this.viewer.GetMeshIntersectionUnderMouse (IntersectionMode.MeshOnly, mouseCoordinates);
        if (intersection === null) {
            this.ClearMarkers ();
            this.UpdatePanel ();
            return;
        }

        const requiredPoints = this.GetRequiredPointCount ();

        if (this.markers.length >= requiredPoints) {
            this.ClearMarkers ();
        }

        this.AddMarker (intersection);
        this.UpdatePanel ();
    }

    MouseMove (mouseCoordinates)
    {
        this.UpdateAnnotations ();
        let intersection = this.viewer.GetMeshIntersectionUnderMouse (IntersectionMode.MeshOnly, mouseCoordinates);
        if (intersection === null) {
            if (this.tempMarker !== null) {
                this.tempMarker.Show (false);
                this.viewer.Render ();
            }
            return;
        }
        if (this.tempMarker === null) {
            this.tempMarker = this.GenerateMarker (intersection);
        }
        this.tempMarker.UpdatePosition (intersection);
        this.tempMarker.Show (true);
        this.viewer.Render ();
    }

    AddMarker (intersection)
    {
        let marker = this.GenerateMarker (intersection);
        this.markers.push (marker);

        const requiredPoints = this.GetRequiredPointCount ();
        if (this.markers.length === requiredPoints) {
            if (this.mode === MeasureMode.Distance) {
                this.CreateDistanceMeasurement (this.markers[0], this.markers[1]);
            } else if (this.mode === MeasureMode.Angle) {
                this.CreateAngleMeasurement (this.markers[0], this.markers[1], this.markers[2]);
            }
        }
    }

    CreateDistanceMeasurement (startMarker, endMarker)
    {
        const measurement = new DistanceMeasurement (startMarker, endMarker, this.viewer);
        this.measurements.push (measurement);
    }

    CreateAngleMeasurement (vertexMarker, point1Marker, point2Marker)
    {
        const measurement = new AngleMeasurement (vertexMarker, point1Marker, point2Marker, this.viewer);
        this.measurements.push (measurement);
    }

    GenerateMarker (intersection)
    {
        let radius = this.GetMarkerRadius ();
        let marker = new Marker (intersection, radius);
        this.viewer.AddExtraObject (marker.GetObject ());
        return marker;
    }

    UpdatePanel ()
    {
        function BlendBackgroundWithPageBackground (backgroundColor)
        {
            let bodyStyle = window.getComputedStyle (document.body, null);
            let bgColors = bodyStyle.backgroundColor.match (/\d+/g);
            if (bgColors.length < 3) {
                return new RGBColor (backgroundColor.r, backgroundColor.g, backgroundColor.b);
            }
            let alpha = ColorComponentToFloat (backgroundColor.a);
            return new RGBColor (
                parseInt (bgColors[0], 10) * (1.0 - alpha) + backgroundColor.r * alpha,
                parseInt (bgColors[1], 10) * (1.0 - alpha) + backgroundColor.g * alpha,
                parseInt (bgColors[2], 10) * (1.0 - alpha) + backgroundColor.b * alpha
            );
        }

        function AddValue (panel, icon, title, value)
        {
            let svgIcon = AddSvgIconElement (panel, icon, 'left_inline');
            svgIcon.title = title;
            AddDiv (panel, 'ov_measure_value', value);
        }

        ClearDomElement (this.panel);
        if (this.settings.backgroundIsEnvMap) {
            this.panel.style.color = '#ffffff';
            this.panel.style.backgroundColor = 'rgba(0,0,0,0.5)';
        } else {
            let blendedColor = BlendBackgroundWithPageBackground (this.settings.backgroundColor);
            if (IsDarkTextNeededForColor (blendedColor)) {
                this.panel.style.color = '#000000';
            } else {
                this.panel.style.color = '#ffffff';
            }
            this.panel.style.backgroundColor = 'transparent';
        }

        const requiredPoints = this.GetRequiredPointCount ();

        if (this.mode === MeasureMode.Distance) {
            if (this.markers.length === 0) {
                this.panel.innerHTML = Loc ('Select first point for distance measurement.');
            } else if (this.markers.length === 1) {
                this.panel.innerHTML = Loc ('Select second point for distance measurement.');
            } else {
                let calcResult = CalculateMarkerValues (this.markers[0], this.markers[1]);

                if (calcResult.pointsDistance !== null) {
                    AddValue (this.panel, 'measure_distance', 'Distance of points', calcResult.pointsDistance.toFixed (3));
                }
                if (calcResult.parallelFacesDistance !== null) {
                    AddValue (this.panel, 'measure_distance_parallel', 'Distance of parallel faces', calcResult.parallelFacesDistance.toFixed (3));
                }
                if (calcResult.facesAngle !== null) {
                    let degreeValue = calcResult.facesAngle * RadDeg;
                    AddValue (this.panel, 'measure_angle', 'Angle of faces', degreeValue.toFixed (1) + '\xB0');
                }
            }
        } else if (this.mode === MeasureMode.Angle) {
            if (this.markers.length === 0) {
                this.panel.innerHTML = Loc ('Select vertex point for angle measurement.');
            } else if (this.markers.length === 1) {
                this.panel.innerHTML = Loc ('Select first point for angle measurement.');
            } else if (this.markers.length === 2) {
                this.panel.innerHTML = Loc ('Select second point for angle measurement.');
            } else {
                const vertexPoint = this.markers[0].GetIntersection ().point;
                const point1 = this.markers[1].GetIntersection ().point;
                const point2 = this.markers[2].GetIntersection ().point;

                const v1 = new THREE.Vector3 ().subVectors (point1, vertexPoint);
                const v2 = new THREE.Vector3 ().subVectors (point2, vertexPoint);

                const angle = v1.angleTo (v2);
                const angleDeg = angle * RadDeg;

                AddValue (this.panel, 'measure_angle', 'Angle (3 points)', angleDeg.toFixed (1) + '\xB0');
            }
        }
        this.Resize ();
    }

    UpdateAnnotations ()
    {
        if (!this.isActive) {
            return;
        }

        const canvas = this.viewer.GetCanvas ();
        const canvasRect = canvas.getBoundingClientRect ();
        const camera = this.viewer.camera;

        for (const measurement of this.measurements) {
            measurement.UpdateAnnotations (camera, canvasRect);
        }
    }

    Resize ()
    {
        if (!this.isActive) {
            return;
        }
        let canvas = this.viewer.GetCanvas ();
        let canvasRect = canvas.getBoundingClientRect ();
        let panelRect = this.panel.getBoundingClientRect ();
        let canvasWidth = canvasRect.right - canvasRect.left;
        let panelWidth = panelRect.right - panelRect.left;
        this.panel.style.left = (canvasRect.left + (canvasWidth - panelWidth) / 2) + 'px';
        this.panel.style.top = (canvasRect.top + 10) + 'px';

        this.UpdateAnnotations ();
    }

    ClearMarkers ()
    {
        this.markers = [];
        this.tempMarker = null;
        if (this.measurements.length === 0) {
            this.viewer.ClearExtra ();
        }
    }

    ClearAllMeasurements ()
    {
        for (const measurement of this.measurements) {
            measurement.Remove ();
        }
        this.measurements = [];
        this.viewer.ClearExtra ();
        this.markers = [];
        this.tempMarker = null;
    }
}
