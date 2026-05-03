import { IsDefined } from '../core/core.js';
import { Direction } from '../geometry/geometry.js';
import { InputFilesFromFileObjects, InputFilesFromUrls } from '../import/importerfiles.js';
import { ImportErrorCode, ImportSettings } from '../import/importer.js';
import { TransformFileHostUrls } from '../io/fileutils.js';
import { ParameterConverter } from '../parameters/parameterlist.js';
import { ThreeModelLoader } from '../threejs/threemodelloader.js';
import { Viewer } from './viewer.js';
import { EnvironmentSettings } from './shadingmodel.js';
import { Loc } from '../core/localization.js';

/**
 * This is the main object for embedding the viewer on a website.
 */
export class EmbeddedViewer
{
    /**
     * @param {HTMLElement} parentElement The parent element for the viewer canvas. It must be an
     * existing DOM element and it will be the container for the canvas. The size of the viewer will
     * be automatically adjusted to the size of the parent element.
     * @param {object} parameters Parameters for embedding.
     * @param {Camera} [parameters.camera] Camera to use. If not specified, the default camera will
     * be used and the model will be fitted to the window.
     * @param {ProjectionMode} [parameters.projectionMode] Camera projection mode.
     * @param {RGBAColor} [parameters.backgroundColor] Background color of the canvas.
     * @param {RGBColor} [parameters.defaultColor] Default color of the model. It has effect only
     * if the imported model doesn't specify any color.
     * @param {RGBColor} [parameters.defaultLineColor] Default line color of the model. It has effect only
     * if the imported model doesn't specify any color.
     * @param {EdgeSettings} [parameters.edgeSettings] Edge settings.
     * @param {EnvironmentSettings} [parameters.environmentSettings] Environment settings.
     * @param {function} [parameters.onModelLoaded] Callback that is called when the model with all
     * of the textures is fully loaded.
     * @param {function} [parameters.onModelLoadFailed] Callback that is called when the model load failed.
    */
    constructor (parentElement, parameters)
    {
        this.parentElement = parentElement;
        this.parameters = {};
        if (IsDefined (parameters)) {
            this.parameters = parameters;
        }

        this.canvas = document.createElement ('canvas');
        this.parentElement.appendChild (this.canvas);

        this.viewer = new Viewer ();
        this.viewer.Init (this.canvas);

        let width = this.parentElement.clientWidth;
        let height = this.parentElement.clientHeight;
        this.viewer.Resize (width, height);

        if (this.parameters.projectionMode) {
            this.viewer.SetProjectionMode (this.parameters.projectionMode);
        }

        if (this.parameters.backgroundColor) {
            this.viewer.SetBackgroundColor (this.parameters.backgroundColor);
        }

        if (this.parameters.edgeSettings) {
            this.viewer.SetEdgeSettings (this.parameters.edgeSettings);
        }

        if (this.parameters.environmentSettings) {
            this.viewer.SetEnvironmentMapSettings (this.parameters.environmentSettings);
        }

        this.model = null;
        this.modelLoader = new ThreeModelLoader ();

        this.progressDiv = null;
        window.addEventListener ('resize', () => {
            this.Resize ();
        });
    }

    /**
     * Loads the model based on a list of urls. The list must contain the main model file and all
     * of the referenced files. For example in case of an obj file the list must contain the
     * corresponding mtl and texture files, too.
     * @param {string[]} modelUrls Url list of model files.
     */
    LoadModelFromUrlList (modelUrls)
    {
        TransformFileHostUrls (modelUrls);
        let inputFiles = InputFilesFromUrls (modelUrls);
        this.LoadModelFromInputFiles (inputFiles);
    }

    /**
     * Loads the model based on a list of {@link File} objects. The list must contain the main model
     * file and all of the referenced files. You must use this method when you are using a file picker
     * or drag and drop to select files from a computer.
     * @param {File[]} fileList File object list of model files.
     */
    LoadModelFromFileList (fileList)
    {
        let inputFiles = InputFilesFromFileObjects (fileList);
        this.LoadModelFromInputFiles (inputFiles);
    }

    /**
     * Loads the model based on a list of {@link InputFile} objects. This method is used
     * internally, you should use LoadModelFromUrlList or LoadModelFromFileList instead.
     * @param {InputFile[]} inputFiles List of model files.
     */
    LoadModelFromInputFiles (inputFiles)
    {
        if (inputFiles === null || inputFiles.length === 0) {
            return;
        }

        this.viewer.Clear ();
        let settings = new ImportSettings ();
        if (this.parameters.defaultColor) {
            settings.defaultColor = this.parameters.defaultColor;
        }
        if (this.parameters.defaultLineColor) {
            settings.defaultLineColor = this.parameters.defaultLineColor;
        }

        this.model = null;
        if (this.progressDiv !== null) {
            this.parentElement.removeChild (this.progressDiv);
            this.progressDiv = null;
        }
        this.modelLoader.LoadModel (inputFiles, settings, {
            onLoadStart : () => {
                this.canvas.style.display = 'none';
                this.progressDiv = document.createElement ('div');
                this.progressDiv.innerHTML = Loc ('Loading model...');
                this.parentElement.appendChild (this.progressDiv);
            },
            onFileListProgress : (current, total) => {
            },
            onFileLoadProgress : (current, total) => {
            },
            onImportStart : () => {
                this.progressDiv.innerHTML = Loc ('Importing model...');
            },
            onVisualizationStart : () => {
                this.progressDiv.innerHTML = Loc ('Visualizing model...');
            },
            onModelFinished : (importResult, threeObject) => {
                this.parentElement.removeChild (this.progressDiv);
                this.progressDiv = null;
                this.canvas.style.display = 'inherit';
                this.viewer.SetMainObject (threeObject);
                let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
                    return true;
                });
                this.viewer.AdjustClippingPlanesToSphere (boundingSphere);
                if (this.parameters.camera) {
                    this.viewer.SetCamera (this.parameters.camera);
                } else {
                    this.viewer.SetUpVector (Direction.Y, false);
                    this.viewer.FitSphereToWindow (boundingSphere, false);
                }

                this.model = importResult.model;
                if (this.parameters.onModelLoaded) {
                    this.parameters.onModelLoaded ();
                }
            },
            onTextureLoaded : () => {
                this.viewer.Render ();
            },
            onLoadError : (importError) => {
                let message = Loc ('Unknown error.');
                if (importError.code === ImportErrorCode.NoImportableFile) {
                    message = Loc ('No importable file found.');
                } else if (importError.code === ImportErrorCode.FailedToLoadFile) {
                    message = Loc ('Failed to load file for import.');
                } else if (importError.code === ImportErrorCode.ImportFailed) {
                    message = Loc ('Failed to import model.');
                }
                if (importError.message !== null) {
                    message += ' (' + importError.message + ')';
                }
                this.progressDiv.innerHTML = message;
                if (this.parameters.onModelLoadFailed) {
                    this.parameters.onModelLoadFailed ();
                }
            }
        });
    }

    /**
     * Returns the underlying Viewer object.
     * @returns {Viewer}
     */
    GetViewer ()
    {
        return this.viewer;
    }

    /**
     * Returns the underlying Model object.
     * @returns {Model}
     */
    GetModel ()
    {
        return this.model;
    }

    /**
     * This method must be called when the size of the parent element changes to make sure that the
     * context has the same dimensions as the parent element.
     */
    Resize ()
    {
        let width = this.parentElement.clientWidth;
        let height = this.parentElement.clientHeight;
        this.viewer.Resize (width, height);
    }

    /**
     * Returns the current canvas size.
     * @returns {object} Object with width and height properties.
     */
    GetImageSize ()
    {
        return this.viewer.GetImageSize ();
    }

    /**
     * Returns the current canvas size considering the device pixel ratio.
     * @returns {object} Object with width and height properties.
     */
    GetCanvasSize ()
    {
        return this.viewer.GetCanvasSize ();
    }

    /**
     * Creates a screenshot from the current view and returns it as a data URL.
     * @param {number} width The width of the screenshot.
     * @param {number} height The height of the screenshot.
     * @param {boolean} isTransparent If true, the background will be transparent.
     * @param {string} [imageFormat] The image format. Can be 'image/png' or 'image/jpeg'. Default is 'image/png'.
     * @param {number} [imageQuality] The image quality for JPEG format. A number between 0 and 1. Default is 0.92.
     * @returns {string} The data URL of the screenshot.
     */
    GetImageAsDataUrl (width, height, isTransparent, imageFormat, imageQuality)
    {
        return this.viewer.GetImageAsDataUrl (width, height, isTransparent, imageFormat, imageQuality);
    }

    /**
     * Creates a screenshot from the current view and returns it as an ArrayBuffer.
     * @param {number} width The width of the screenshot.
     * @param {number} height The height of the screenshot.
     * @param {boolean} isTransparent If true, the background will be transparent.
     * @param {string} [imageFormat] The image format. Can be 'image/png' or 'image/jpeg'. Default is 'image/png'.
     * @param {number} [imageQuality] The image quality for JPEG format. A number between 0 and 1. Default is 0.92.
     * @returns {object} An object containing { buffer, mimeType, extension }.
     */
    GetImageAsArrayBuffer (width, height, isTransparent, imageFormat, imageQuality)
    {
        return this.viewer.GetImageAsArrayBuffer (width, height, isTransparent, imageFormat, imageQuality);
    }

    /**
     * Creates a screenshot from the current view using the current canvas size.
     * This is a convenience method for quick screenshots.
     * @param {string} [imageFormat] The image format. Can be 'image/png' or 'image/jpeg'. Default is 'image/png'.
     * @param {number} [imageQuality] The image quality for JPEG format. A number between 0 and 1. Default is 0.92.
     * @returns {object} An object containing { buffer, mimeType, extension, width, height }.
     */
    GetCurrentViewAsImage (imageFormat, imageQuality)
    {
        let canvasSize = this.GetCanvasSize ();
        let result = this.GetImageAsArrayBuffer (
            canvasSize.width,
            canvasSize.height,
            false,
            imageFormat,
            imageQuality
        );
        return {
            buffer : result.buffer,
            mimeType : result.mimeType,
            extension : result.extension,
            width : canvasSize.width,
            height : canvasSize.height
        };
    }

    /**
     * Exports the current view as an image file and triggers a download in the browser.
     * This is a one-click export method for end users.
     * @param {string} [fileName='model'] The base name of the file (without extension).
     * @param {string} [imageFormat='image/png'] The image format. Can be 'image/png' or 'image/jpeg'.
     * @param {number} [imageQuality=0.92] The image quality for JPEG format. A number between 0 and 1.
     * @param {object} [options] Additional options.
     * @param {number} [options.width] Custom width for the screenshot. Uses current size if not specified.
     * @param {number} [options.height] Custom height for the screenshot. Uses current size if not specified.
     * @param {boolean} [options.transparent=false] Whether to use transparent background (PNG only).
     * @returns {boolean} Returns true if the export was initiated, false otherwise.
     */
    ExportImageAsFile (fileName, imageFormat, imageQuality, options)
    {
        if (typeof document === 'undefined' || typeof URL === 'undefined') {
            return false;
        }
        let actualFileName = fileName && typeof fileName === 'string' ? fileName : 'model';
        let actualFormat = imageFormat && typeof imageFormat === 'string' ? imageFormat : 'image/png';
        let actualQuality = imageQuality !== undefined && imageQuality !== null ? imageQuality : 0.92;
        let actualWidth = null;
        let actualHeight = null;
        let isTransparent = false;
        if (options && typeof options === 'object') {
            if (options.width !== undefined && options.width !== null) {
                actualWidth = options.width;
            }
            if (options.height !== undefined && options.height !== null) {
                actualHeight = options.height;
            }
            if (options.transparent !== undefined && options.transparent !== null) {
                isTransparent = options.transparent;
            }
        }
        if (actualWidth === null || actualHeight === null) {
            let canvasSize = this.GetCanvasSize ();
            if (actualWidth === null) {
                actualWidth = canvasSize.width;
            }
            if (actualHeight === null) {
                actualHeight = canvasSize.height;
            }
        }
        let imageResult = this.GetImageAsArrayBuffer (
            actualWidth,
            actualHeight,
            isTransparent,
            actualFormat,
            actualQuality
        );
        if (imageResult.buffer === null) {
            return false;
        }
        let fullFileName = actualFileName + '.' + imageResult.extension;
        let blob = new Blob ([imageResult.buffer], { type : imageResult.mimeType });
        let url = URL.createObjectURL (blob);
        try {
            let link = document.createElement ('a');
            link.href = url;
            link.download = fullFileName;
            document.body.appendChild (link);
            link.click ();
            document.body.removeChild (link);
        } finally {
            URL.revokeObjectURL (url);
        }
        return true;
    }

    /**
     * Frees up all the memory that is allocated by the viewer. You should call this function if
     * yo don't need the viewer anymore.
     */
    Destroy ()
    {
        this.modelLoader.Destroy ();
        this.viewer.Destroy ();
        this.model = null;
    }
}

/**
 * Loads the model specified by urls.
 * @param {HTMLElement} parentElement The parent element for the viewer canvas.
 * @param {string[]} modelUrls Url list of model files.
 * @param {object} parameters See {@link EmbeddedViewer} constructor for details.
 * @returns {EmbeddedViewer}
 */
export function Init3DViewerFromUrlList (parentElement, modelUrls, parameters)
{
    let viewer = new EmbeddedViewer (parentElement, parameters);
    viewer.LoadModelFromUrlList (modelUrls);
    return viewer;
}

/**
 * Loads the model specified by File objects.
 * @param {HTMLElement} parentElement The parent element for the viewer canvas.
 * @param {File[]} models File object list of model files.
 * @param {object} parameters See {@link EmbeddedViewer} constructor for details.
 * @returns {EmbeddedViewer}
 */
export function Init3DViewerFromFileList (parentElement, models, parameters)
{
    let viewer = new EmbeddedViewer (parentElement, parameters);
    viewer.LoadModelFromFileList (models);
    return viewer;
}

/**
 * Loads all the models on the page. This function looks for all the elements with online_3d_viewer
 * class name, and loads the model according to the tag's parameters. It must be called after the
 * document is loaded.
 * @returns {EmbeddedViewer[]} Array of the created {@link EmbeddedViewer} objects.
 */
export function Init3DViewerElements (onReady)
{
    function LoadElement (element)
    {
        let camera = null;
        let cameraParams = element.getAttribute ('camera');
        if (cameraParams) {
            camera = ParameterConverter.StringToCamera (cameraParams);
        }

        let projectionMode = null;
        let cameraModeParams = element.getAttribute ('projectionmode');
        if (cameraModeParams) {
            projectionMode = ParameterConverter.StringToProjectionMode (cameraModeParams);
        }

        let backgroundColor = null;
        let backgroundColorParams = element.getAttribute ('backgroundcolor');
        if (backgroundColorParams) {
            backgroundColor = ParameterConverter.StringToRGBAColor (backgroundColorParams);
        }

        let defaultColor = null;
        let defaultColorParams = element.getAttribute ('defaultcolor');
        if (defaultColorParams) {
            defaultColor = ParameterConverter.StringToRGBColor (defaultColorParams);
        }

        let defaultLineColor = null;
        let defaultLineColorParams = element.getAttribute ('defaultlinecolor');
        if (defaultLineColorParams) {
            defaultLineColor = ParameterConverter.StringToRGBColor (defaultLineColorParams);
        }

        let edgeSettings = null;
        let edgeSettingsParams = element.getAttribute ('edgesettings');
        if (edgeSettingsParams) {
            edgeSettings = ParameterConverter.StringToEdgeSettings (edgeSettingsParams);
        }

        let environmentSettings = null;
        let environmentMapParams = element.getAttribute ('environmentmap');
        if (environmentMapParams) {
            let environmentMapParts = environmentMapParams.split (',');
            if (environmentMapParts.length === 6) {
                let backgroundIsEnvMap = false;
                let backgroundIsEnvMapParam = element.getAttribute ('environmentmapbg');
                if (backgroundIsEnvMapParam && backgroundIsEnvMapParam === 'true') {
                    backgroundIsEnvMap = true;
                }
                environmentSettings = new EnvironmentSettings (environmentMapParts, backgroundIsEnvMap);
            }
        }

        let modelUrls = null;
        let modelParams = element.getAttribute ('model');
        if (modelParams) {
            modelUrls = ParameterConverter.StringToModelUrls (modelParams);
        }

        return Init3DViewerFromUrlList (element, modelUrls, {
            camera : camera,
            projectionMode : projectionMode,
            backgroundColor : backgroundColor,
            defaultLineColor : defaultLineColor,
            defaultColor : defaultColor,
            edgeSettings : edgeSettings,
            environmentSettings : environmentSettings
        });
    }

    let viewerElements = [];
    let elements = document.getElementsByClassName ('online_3d_viewer');
    for (let i = 0; i < elements.length; i++) {
        let element = elements[i];
        let viewerElement = LoadElement (element);
        viewerElements.push (viewerElement);
    }
    return viewerElements;
}
