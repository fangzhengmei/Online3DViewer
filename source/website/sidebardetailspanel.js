import { RunTaskAsync } from '../engine/core/taskrunner.js';
import { SubCoord3D } from '../engine/geometry/coord3d.js';
import { GetBoundingBox, IsTwoManifold } from '../engine/model/modelutils.js';
import { CalculateVolume, CalculateSurfaceArea } from '../engine/model/quantities.js';
import { Property, PropertyToString, PropertyType } from '../engine/model/property.js';
import { AddDiv, AddDomElement, ClearDomElement } from '../engine/viewer/domutils.js';
import { SidebarPanel } from './sidebarpanel.js';
import { CreateInlineColorCircle, AddRangeSlider } from './utils.js';
import { GetFileName, IsUrl } from '../engine/io/fileutils.js';
import { MaterialSource, MaterialType } from '../engine/model/material.js';
import { RGBColor, RGBColorToHexString, ColorComponentFromFloat } from '../engine/model/color.js';
import { Unit } from '../engine/model/unit.js';
import { Loc } from '../engine/core/localization.js';

import * as Pickr from '@simonwep/pickr';
import '@simonwep/pickr/dist/themes/monolith.min.css';

function AddColorPicker (parentDiv, opacity, defaultColor, predefinedColors, onChange)
{
    let pickr = Pickr.create ({
        el : parentDiv,
        theme : 'monolith',
        position : 'left-start',
        swatches : predefinedColors,
        comparison : false,
        default : defaultColor,
        components : {
            preview : false,
            opacity : opacity,
            hue : true,
            interaction: {
                hex : false,
                rgba : false,
                hsla : false,
                hsva : false,
                cmyk : false,
                input : true,
                clear : false,
                save : false
            }
        }
    });
    pickr.on ('change', (color, source, instance) => {
        let rgbaColor = color.toRGBA ();
        onChange (
            parseInt (rgbaColor[0], 10),
            parseInt (rgbaColor[1], 10),
            parseInt (rgbaColor[2], 10),
            ColorComponentFromFloat (rgbaColor[3])
        );
    });
    return pickr;
}

function AddPercentSlider (parentDiv, min, max, value, onChange)
{
    let sliderDiv = AddDiv (parentDiv, 'ov_sidebar_settings_row large');
    let slider = AddRangeSlider (sliderDiv, min, max);
    slider.value = value;
    let sliderValue = AddDomElement (sliderDiv, 'span', 'ov_slider_label', Math.round (value) + '%');
    slider.addEventListener ('input', () => {
        sliderValue.innerHTML = Math.round (slider.value) + '%';
    });
    slider.addEventListener ('change', () => {
        onChange (slider.value);
    });
    return slider;
}

function UnitToString (unit)
{
    switch (unit) {
        case Unit.Millimeter:
            return Loc ('Millimeter');
        case Unit.Centimeter:
            return Loc ('Centimeter');
        case Unit.Meter:
            return Loc ('Meter');
        case Unit.Inch:
            return Loc ('Inch');
        case Unit.Foot:
            return Loc ('Foot');
    }
    return Loc ('Unknown');
}

export class SidebarDetailsPanel extends SidebarPanel
{
    constructor (parentDiv)
    {
        super (parentDiv);
        this.callbacks = null;
        this.currentMaterialIndex = null;
        this.colorPickers = [];
    }

    GetName ()
    {
        return Loc ('Details');
    }

    GetIcon ()
    {
        return 'details';
    }

    Init (callbacks)
    {
        this.callbacks = callbacks;
    }

    Clear ()
    {
        super.Clear ();
        for (let colorPicker of this.colorPickers) {
            colorPicker.hide ();
            colorPicker.destroyAndRemove ();
        }
        this.colorPickers = [];
        this.currentMaterialIndex = null;
    }

    AddObject3DProperties (model, object3D)
    {
        this.Clear ();
        let table = AddDiv (this.contentDiv, 'ov_property_table');
        let boundingBox = GetBoundingBox (object3D);
        let size = SubCoord3D (boundingBox.max, boundingBox.min);
        let unit = model.GetUnit ();
        this.AddProperty (table, new Property (PropertyType.Integer, Loc ('Vertices'), object3D.VertexCount ()));
        let lineSegmentCount = object3D.LineSegmentCount ();
        if (lineSegmentCount > 0) {
            this.AddProperty (table, new Property (PropertyType.Integer, Loc ('Lines'), lineSegmentCount));
        }
        let triangleCount = object3D.TriangleCount ();
        if (triangleCount > 0) {
            this.AddProperty (table, new Property (PropertyType.Integer, Loc ('Triangles'), triangleCount));
        }
        if (unit !== Unit.Unknown) {
            this.AddProperty (table, new Property (PropertyType.Text, Loc ('Unit'), UnitToString (unit)));
        }
        this.AddProperty (table, new Property (PropertyType.Number, Loc ('Size X'), size.x));
        this.AddProperty (table, new Property (PropertyType.Number, Loc ('Size Y'), size.y));
        this.AddProperty (table, new Property (PropertyType.Number, Loc ('Size Z'), size.z));
        this.AddCalculatedProperty (table, Loc ('Volume'), () => {
            if (!IsTwoManifold (object3D)) {
                return null;
            }
            const volume = CalculateVolume (object3D);
            return new Property (PropertyType.Number, null, volume);
        });
        this.AddCalculatedProperty (table, Loc ('Surface'), () => {
            const surfaceArea = CalculateSurfaceArea (object3D);
            return new Property (PropertyType.Number, null, surfaceArea);
        });
        if (object3D.PropertyGroupCount () > 0) {
            let customTable = AddDiv (this.contentDiv, 'ov_property_table ov_property_table_custom');
            for (let i = 0; i < object3D.PropertyGroupCount (); i++) {
                const propertyGroup = object3D.GetPropertyGroup (i);
                this.AddPropertyGroup (customTable, propertyGroup);
                for (let j = 0; j < propertyGroup.PropertyCount (); j++) {
                    const property = propertyGroup.GetProperty (j);
                    this.AddPropertyInGroup (customTable, property);
                }
            }
        }
        this.Resize ();
    }

    AddMaterialProperties (material, materialIndex)
    {
        function AddTextureMap (obj, table, name, map)
        {
            if (map === null || map.name === null) {
                return;
            }
            let fileName = GetFileName (map.name);
            obj.AddProperty (table, new Property (PropertyType.Text, name, fileName));
        }

        function AddEditableColor (obj, label, color, onColorChange)
        {
            let row = AddDiv (obj, 'ov_property_table_row');
            AddDiv (row, 'ov_property_table_cell ov_property_table_name', label + ':');
            let valueColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_value');
            let colorInput = AddDiv (valueColumn, 'ov_color_picker');
            let predefinedColors = ['#ffffff', '#e3e3e3', '#cc3333', '#fac832', '#4caf50', '#3393bd', '#9b27b0', '#fda4b8'];
            let defaultColorStr = '#' + RGBColorToHexString (color);
            let colorPicker = AddColorPicker (colorInput, false, defaultColorStr, predefinedColors, (r, g, b, a) => {
                onColorChange (new RGBColor (r, g, b));
            });
            obj.colorPickers.push (colorPicker);
            AddDomElement (valueColumn, 'span', null, defaultColorStr);
        }

        function AddEditablePercent (obj, label, value, min, max, onChange)
        {
            let row = AddDiv (obj, 'ov_property_table_row');
            AddDiv (row, 'ov_property_table_cell ov_property_table_name', label + ':');
            let valueColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_value');
            AddPercentSlider (valueColumn, min, max, value * 100, (newValue) => {
                onChange (newValue / 100.0);
            });
        }

        this.Clear ();
        this.currentMaterialIndex = materialIndex;

        let table = AddDiv (this.contentDiv, 'ov_property_table');
        let typeString = null;
        if (material.type === MaterialType.Phong) {
            typeString = Loc ('Phong');
        } else if (material.type === MaterialType.Physical) {
            typeString = Loc ('Physical');
        }
        let materialSource = (material.source !== MaterialSource.Model) ? Loc ('Default') : Loc ('Model');
        this.AddProperty (table, new Property (PropertyType.Text, Loc ('Source'), materialSource));
        this.AddProperty (table, new Property (PropertyType.Text, Loc ('Type'), typeString));

        let hasEditableCallbacks = this.callbacks !== undefined && this.callbacks !== null &&
            this.callbacks.onMaterialColorChanged !== undefined &&
            this.callbacks.onMaterialOpacityChanged !== undefined;

        if (material.vertexColors) {
            this.AddProperty (table, new Property (PropertyType.Text, Loc ('Color'), Loc ('Vertex colors')));
        } else {
            if (hasEditableCallbacks && materialIndex !== null) {
                AddEditableColor (this, table, Loc ('Color'), material.color, (color) => {
                    this.callbacks.onMaterialColorChanged (materialIndex, color);
                });
            } else {
                this.AddProperty (table, new Property (PropertyType.Color, Loc ('Color'), material.color));
            }

            if (material.type === MaterialType.Phong) {
                if (hasEditableCallbacks && materialIndex !== null) {
                    AddEditableColor (this, table, Loc ('Specular'), material.specular, (color) => {
                        this.callbacks.onMaterialSpecularChanged (materialIndex, color);
                    });
                } else {
                    this.AddProperty (table, new Property (PropertyType.Color, Loc ('Specular'), material.specular));
                }
                this.AddProperty (table, new Property (PropertyType.Color, Loc ('Ambient'), material.ambient));
            }
        }

        if (material.type === MaterialType.Physical) {
            if (hasEditableCallbacks && materialIndex !== null) {
                AddEditablePercent (this, table, Loc ('Metalness'), material.metalness, 0, 100, (value) => {
                    this.callbacks.onMaterialMetalnessChanged (materialIndex, value);
                });
                AddEditablePercent (this, table, Loc ('Roughness'), material.roughness, 0, 100, (value) => {
                    this.callbacks.onMaterialRoughnessChanged (materialIndex, value);
                });
            } else {
                this.AddProperty (table, new Property (PropertyType.Percent, Loc ('Metalness'), material.metalness));
                this.AddProperty (table, new Property (PropertyType.Percent, Loc ('Roughness'), material.roughness));
            }
        }

        if (hasEditableCallbacks && materialIndex !== null) {
            AddEditablePercent (this, table, Loc ('Opacity'), material.opacity, 0, 100, (value) => {
                this.callbacks.onMaterialOpacityChanged (materialIndex, value);
            });
        } else {
            this.AddProperty (table, new Property (PropertyType.Percent, Loc ('Opacity'), material.opacity));
        }

        AddTextureMap (this, table, Loc ('Diffuse Map'), material.diffuseMap);
        AddTextureMap (this, table, Loc ('Bump Map'), material.bumpMap);
        AddTextureMap (this, table, Loc ('Normal Map'), material.normalMap);
        AddTextureMap (this, table, Loc ('Emissive Map'), material.emissiveMap);
        if (material.type === MaterialType.Phong) {
            AddTextureMap (this, table, Loc ('Specular Map'), material.specularMap);
        } else if (material.type === MaterialType.Physical) {
            AddTextureMap (this, table, Loc ('Metallic Map'), material.metalnessMap);
        }
        this.Resize ();
    }

    AddPropertyGroup (table, propertyGroup)
    {
        let row = AddDiv (table, 'ov_property_table_row group', propertyGroup.name);
        row.setAttribute ('title', propertyGroup.name);
    }

    AddProperty (table, property)
    {
        let row = AddDiv (table, 'ov_property_table_row');
        let nameColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_name', property.name + ':');
        let valueColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_value');
        nameColumn.setAttribute ('title', property.name);
        this.DisplayPropertyValue (property, valueColumn);
        return row;
    }

    AddPropertyInGroup (table, property)
    {
        let row = this.AddProperty (table, property);
        row.classList.add ('ingroup');
    }

    AddCalculatedProperty (table, name, calculateValue)
    {
        let row = AddDiv (table, 'ov_property_table_row');
        let nameColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_name', name + ':');
        let valueColumn = AddDiv (row, 'ov_property_table_cell ov_property_table_value');
        nameColumn.setAttribute ('title', name);

        let calculateButton = AddDiv (valueColumn, 'ov_property_table_button', Loc ('Calculate...'));
        calculateButton.addEventListener ('click', () => {
            ClearDomElement (valueColumn);
            valueColumn.innerHTML = Loc ('Please wait...');
            RunTaskAsync (() => {
                let propertyValue = calculateValue ();
                if (propertyValue === null) {
                    valueColumn.innerHTML = '-';
                } else {
                    this.DisplayPropertyValue (propertyValue, valueColumn);
                }
            });
        });
    }

    DisplayPropertyValue (property, targetDiv)
    {
        ClearDomElement (targetDiv);
        let valueHtml = null;
        let valueTitle = null;
        if (property.type === PropertyType.Text) {
            if (IsUrl (property.value)) {
                valueHtml = '<a target="_blank" href="' + property.value + '">' + property.value + '</a>';
                valueTitle = property.value;
            } else {
                valueHtml = PropertyToString (property);
            }
        } else if (property.type === PropertyType.Color) {
            let hexString = '#' + RGBColorToHexString (property.value);
            let colorCircle = CreateInlineColorCircle (property.value);
            targetDiv.appendChild (colorCircle);
            AddDomElement (targetDiv, 'span', null, hexString);
        } else {
            valueHtml = PropertyToString (property);
        }
        if (valueHtml !== null) {
            targetDiv.innerHTML = valueHtml;
            targetDiv.setAttribute ('title', valueTitle !== null ? valueTitle : valueHtml);
        }
    }
}
