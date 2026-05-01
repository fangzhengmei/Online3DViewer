import { AddDiv, ClearDomElement } from '../engine/viewer/domutils.js';
import { ProjectionMode } from '../engine/viewer/camera.js';
import { DegRad } from '../engine/geometry/geometry.js';
import { Loc } from '../engine/core/localization.js';
import { Unit } from '../engine/model/unit.js';

function UnitToString (unit)
{
    switch (unit) {
        case Unit.Millimeter:
            return Loc ('mm');
        case Unit.Centimeter:
            return Loc ('cm');
        case Unit.Meter:
            return Loc ('m');
        case Unit.Inch:
            return Loc ('in');
        case Unit.Foot:
            return Loc ('ft');
    }
    return '';
}

function GetNiceScaleValue (value)
{
    if (value <= 0) {
        return 1;
    }
    const magnitude = Math.pow (10, Math.floor (Math.log10 (value)));
    const normalized = value / magnitude;
    let nice;
    if (normalized <= 1.0) {
        nice = 1.0;
    } else if (normalized <= 2.0) {
        nice = 2.0;
    } else if (normalized <= 5.0) {
        nice = 5.0;
    } else {
        nice = 10.0;
    }
    return nice * magnitude;
}

function FormatScaleValue (value)
{
    if (Math.abs (value) < 0.0001) {
        return '0';
    }
    if (Math.abs (value) >= 1000) {
        return value.toFixed (0);
    }
    if (Math.abs (value) >= 100) {
        return value.toFixed (1);
    }
    if (Math.abs (value) >= 10) {
        return value.toFixed (2);
    }
    if (Math.abs (value) >= 1) {
        return value.toFixed (2);
    }
    return value.toFixed (3);
}

export class ScaleRuler
{
    constructor (viewer, settings)
    {
        this.viewer = viewer;
        this.settings = settings;
        this.isActive = false;
        this.panel = null;
        this.button = null;
        this.model = null;
        this.boundingSphere = null;
    }

    SetButton (button)
    {
        this.button = button;
    }

    SetModel (model)
    {
        this.model = model;
    }

    SetBoundingSphere (boundingSphere)
    {
        this.boundingSphere = boundingSphere;
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
        if (this.button !== null) {
            this.button.SetSelected (isActive);
        }
        if (this.isActive) {
            this.panel = AddDiv (document.body, 'ov_scaleruler_panel');
            this.UpdateRuler ();
            this.Resize ();
        } else {
            if (this.panel !== null) {
                this.panel.remove ();
                this.panel = null;
            }
        }
    }

    GetUnitString ()
    {
        if (this.model === null) {
            return '';
        }
        return UnitToString (this.model.GetUnit ());
    }

    CalculateWorldUnitsPerPixel ()
    {
        const canvasSize = this.viewer.GetCanvasSize ();
        const canvasWidth = canvasSize.width;
        const canvasHeight = canvasSize.height;

        if (canvasWidth <= 0 || canvasHeight <= 0) {
            return null;
        }

        const navigationCamera = this.viewer.GetCamera ();
        const projectionMode = this.viewer.GetProjectionMode ();

        const eye = navigationCamera.eye;
        const center = navigationCamera.center;

        const dx = eye.x - center.x;
        const dy = eye.y - center.y;
        const dz = eye.z - center.z;
        const distance = Math.sqrt (dx * dx + dy * dy + dz * dz);

        if (projectionMode === ProjectionMode.Orthographic) {
            const fovRad = navigationCamera.fov * DegRad;
            const frustumHalfHeight = distance * Math.tan (0.5 * fovRad);
            const worldHeight = frustumHalfHeight * 2.0;
            return worldHeight / canvasHeight;
        } else {
            const fovRad = navigationCamera.fov * DegRad;
            const screenHeightAtDistance = 2.0 * distance * Math.tan (0.5 * fovRad);
            return screenHeightAtDistance / canvasHeight;
        }
    }

    UpdateRuler ()
    {
        if (!this.isActive || this.panel === null) {
            return;
        }

        ClearDomElement (this.panel);

        const unitsPerPixel = this.CalculateWorldUnitsPerPixel ();
        if (unitsPerPixel === null || unitsPerPixel <= 0) {
            const noDataDiv = AddDiv (this.panel, 'ov_scaleruler_nodata');
            noDataDiv.innerHTML = Loc ('No data available');
            return;
        }

        const canvasSize = this.viewer.GetCanvasSize ();
        const maxRulerWidth = Math.min (canvasSize.width * 0.4, 300);
        const maxWorldWidth = unitsPerPixel * maxRulerWidth;
        const niceWorldWidth = GetNiceScaleValue (maxWorldWidth);
        const actualPixelWidth = niceWorldWidth / unitsPerPixel;

        const unitStr = this.GetUnitString ();
        const displayValue = FormatScaleValue (niceWorldWidth);

        const rulerContainer = AddDiv (this.panel, 'ov_scaleruler_container');

        const rulerBar = AddDiv (rulerContainer, 'ov_scaleruler_bar');
        rulerBar.style.width = actualPixelWidth + 'px';

        const rulerTicks = AddDiv (rulerBar, 'ov_scaleruler_ticks');
        AddDiv (rulerTicks, 'ov_scaleruler_tick_left');
        AddDiv (rulerTicks, 'ov_scaleruler_tick_middle');
        AddDiv (rulerTicks, 'ov_scaleruler_tick_right');

        const rulerLabel = AddDiv (rulerContainer, 'ov_scaleruler_label');
        rulerLabel.style.width = actualPixelWidth + 'px';
        rulerLabel.innerHTML = displayValue + ' ' + unitStr;

        const infoLabel = AddDiv (rulerContainer, 'ov_scaleruler_info');
        if (this.boundingSphere !== null) {
            const radius = this.boundingSphere.radius;
            const diameter = radius * 2;
            const diameterStr = FormatScaleValue (diameter);
            infoLabel.innerHTML = Loc ('Model size') + ': ~' + diameterStr + ' ' + unitStr;
        } else {
            infoLabel.innerHTML = '';
        }
    }

    Resize ()
    {
        if (!this.isActive || this.panel === null) {
            return;
        }
        let canvas = this.viewer.GetCanvas ();
        let canvasRect = canvas.getBoundingClientRect ();
        let panelRect = this.panel.getBoundingClientRect ();
        let canvasWidth = canvasRect.right - canvasRect.left;
        let panelWidth = panelRect.right - panelRect.left;
        this.panel.style.left = (canvasRect.left + (canvasWidth - panelWidth) / 2) + 'px';
        this.panel.style.bottom = '20px';
    }

    Render ()
    {
        if (this.isActive) {
            this.UpdateRuler ();
        }
    }

    Clear ()
    {
        this.model = null;
        this.boundingSphere = null;
        if (this.isActive) {
            this.UpdateRuler ();
        }
    }
}
