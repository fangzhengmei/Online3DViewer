import { SubCoord3D } from '../engine/geometry/coord3d.js';
import { AddDiv, ClearDomElement } from '../engine/viewer/domutils.js';
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

export class BoundingBoxChecker
{
    constructor (viewer, settings)
    {
        this.viewer = viewer;
        this.settings = settings;
        this.isActive = false;
        this.panel = null;
        this.button = null;
        this.model = null;
        this.boundingBox = null;
    }

    SetButton (button)
    {
        this.button = button;
    }

    SetModel (model)
    {
        this.model = model;
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
            this.panel = AddDiv (document.body, 'ov_boundingbox_panel');
            this.UpdatePanel ();
            this.Resize ();
        } else {
            if (this.panel !== null) {
                this.panel.remove ();
                this.panel = null;
            }
        }
    }

    UpdateBoundingBox (boundingBox)
    {
        this.boundingBox = boundingBox;
        if (this.isActive) {
            this.UpdatePanel ();
        }
    }

    GetBoundingBox ()
    {
        return this.boundingBox;
    }

    GetDimensions ()
    {
        if (this.boundingBox === null) {
            return null;
        }
        let size = SubCoord3D (this.boundingBox.max, this.boundingBox.min);
        return {
            x: Math.abs (size.x),
            y: Math.abs (size.y),
            z: Math.abs (size.z),
            minX: this.boundingBox.min.x,
            minY: this.boundingBox.min.y,
            minZ: this.boundingBox.min.z,
            maxX: this.boundingBox.max.x,
            maxY: this.boundingBox.max.y,
            maxZ: this.boundingBox.max.z
        };
    }

    GetUnitString ()
    {
        if (this.model === null) {
            return '';
        }
        return UnitToString (this.model.GetUnit ());
    }

    UpdatePanel ()
    {
        function BlendBackgroundWithPageBackground (backgroundColor, settings)
        {
            let bodyStyle = window.getComputedStyle (document.body, null);
            let bgColors = bodyStyle.backgroundColor.match (/\d+/g);
            if (bgColors.length < 3) {
                return backgroundColor;
            }
            let alpha = 0.5;
            return {
                r: parseInt (bgColors[0], 10) * (1.0 - alpha) + backgroundColor.r * alpha,
                g: parseInt (bgColors[1], 10) * (1.0 - alpha) + backgroundColor.g * alpha,
                b: parseInt (bgColors[2], 10) * (1.0 - alpha) + backgroundColor.b * alpha
            };
        }

        function IsDarkTextNeededForColor (color)
        {
            let brightness = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
            return brightness > 127;
        }

        ClearDomElement (this.panel);

        if (this.settings.backgroundIsEnvMap) {
            this.panel.style.color = '#ffffff';
            this.panel.style.backgroundColor = 'rgba(0,0,0,0.5)';
        } else {
            let blendedColor = BlendBackgroundWithPageBackground (this.settings.backgroundColor, this.settings);
            if (IsDarkTextNeededForColor (blendedColor)) {
                this.panel.style.color = '#000000';
            } else {
                this.panel.style.color = '#ffffff';
            }
            this.panel.style.backgroundColor = 'transparent';
        }

        let dimensions = this.GetDimensions ();
        let unitStr = this.GetUnitString ();

        if (dimensions === null) {
            this.panel.innerHTML = Loc ('No model loaded.');
        } else {
            let titleDiv = AddDiv (this.panel, 'ov_boundingbox_title', Loc ('Bounding Box'));

            let contentDiv = AddDiv (this.panel, 'ov_boundingbox_content');

            let minDiv = AddDiv (contentDiv, 'ov_boundingbox_row');
            AddDiv (minDiv, 'ov_boundingbox_label', Loc ('Min') + ':');
            AddDiv (minDiv, 'ov_boundingbox_value', `(${dimensions.minX.toFixed (3)}, ${dimensions.minY.toFixed (3)}, ${dimensions.minZ.toFixed (3)}) ${unitStr}`);

            let maxDiv = AddDiv (contentDiv, 'ov_boundingbox_row');
            AddDiv (maxDiv, 'ov_boundingbox_label', Loc ('Max') + ':');
            AddDiv (maxDiv, 'ov_boundingbox_value', `(${dimensions.maxX.toFixed (3)}, ${dimensions.maxY.toFixed (3)}, ${dimensions.maxZ.toFixed (3)}) ${unitStr}`);

            let sizeDiv = AddDiv (contentDiv, 'ov_boundingbox_row ov_boundingbox_size');
            AddDiv (sizeDiv, 'ov_boundingbox_label', Loc ('Size') + ':');
            let sizeValue = AddDiv (sizeDiv, 'ov_boundingbox_value');
            AddDiv (sizeValue, 'ov_boundingbox_dimension',
                `${Loc ('X')}: ${dimensions.x.toFixed (3)} ${unitStr}`);
            AddDiv (sizeValue, 'ov_boundingbox_dimension',
                `${Loc ('Y')}: ${dimensions.y.toFixed (3)} ${unitStr}`);
            AddDiv (sizeValue, 'ov_boundingbox_dimension',
                `${Loc ('Z')}: ${dimensions.z.toFixed (3)} ${unitStr}`);
        }

        this.Resize ();
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
        this.panel.style.top = (canvasRect.top + 10) + 'px';
    }

    Clear ()
    {
        this.boundingBox = null;
        this.model = null;
        if (this.isActive) {
            this.UpdatePanel ();
        }
    }
}
