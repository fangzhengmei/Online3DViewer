import { AddDiv, ClearDomElement, CreateDomElement } from '../engine/viewer/domutils.js';
import { SidebarPanel } from './sidebarpanel.js';
import { Loc } from '../engine/core/localization.js';

export class SidebarAnnotationsPanel extends SidebarPanel
{
    constructor (parentDiv)
    {
        super (parentDiv);
        this.annotations = [];
        this.callbacks = null;
        this.selectedAnnotationId = null;
    }

    GetName ()
    {
        return Loc ('Annotations');
    }

    HasTitle ()
    {
        return true;
    }

    GetIcon ()
    {
        return 'details';
    }

    Init (callbacks)
    {
        super.Init (callbacks);
        this.callbacks = callbacks;
    }

    Clear ()
    {
        this.annotations = [];
        this.selectedAnnotationId = null;
        super.Clear ();
    }

    SetAnnotations (annotations)
    {
        this.annotations = annotations;
        this.UpdateContent ();
    }

    UpdateContent ()
    {
        ClearDomElement (this.contentDiv);

        let headerDiv = AddDiv (this.contentDiv, 'ov_annotations_header');

        let titleDiv = AddDiv (headerDiv, 'ov_annotations_title', Loc ('Annotations'));
        let countSpan = CreateDomElement ('span', null, '(' + this.annotations.length + ')');
        titleDiv.appendChild (countSpan);

        if (this.annotations.length > 0) {
            let clearAllButton = AddDiv (headerDiv, 'ov_button ov_panel_button small', Loc ('Clear All'));
            clearAllButton.addEventListener ('click', () => {
                if (this.callbacks && this.callbacks.onClearAllAnnotations) {
                    this.callbacks.onClearAllAnnotations ();
                }
            });
        }

        if (this.annotations.length === 0) {
            let emptyDiv = AddDiv (this.contentDiv, 'ov_annotations_empty');
            emptyDiv.innerHTML = Loc ('Click on the model to add annotations.');
            this.Resize ();
            return;
        }

        let listDiv = AddDiv (this.contentDiv, 'ov_annotations_list');

        for (let annotation of this.annotations) {
            this.AddAnnotationItem (listDiv, annotation);
        }

        this.Resize ();
    }

    AddAnnotationItem (listDiv, annotation)
    {
        let itemDiv = AddDiv (listDiv, 'ov_annotations_item');
        if (this.selectedAnnotationId === annotation.id) {
            itemDiv.classList.add ('selected');
        }

        let headerRow = AddDiv (itemDiv, 'ov_annotations_item_header');

        let labelDiv = AddDiv (headerRow, 'ov_annotations_item_label');
        let labelInput = CreateDomElement ('input', 'ov_annotations_label_input');
        labelInput.type = 'text';
        labelInput.value = annotation.GetLabel ();
        labelInput.placeholder = Loc ('Label');
        labelDiv.appendChild (labelInput);

        labelInput.addEventListener ('change', () => {
            let newLabel = labelInput.value.trim ();
            if (newLabel === '') {
                newLabel = 'Annotation ' + annotation.id;
            }
            if (this.callbacks && this.callbacks.onUpdateAnnotationLabel) {
                this.callbacks.onUpdateAnnotationLabel (annotation.id, newLabel);
            }
        });

        let buttonsDiv = AddDiv (headerRow, 'ov_annotations_item_buttons');

        let fitButton = AddDiv (buttonsDiv, 'ov_annotations_button fit', '');
        fitButton.title = Loc ('Fit to window');
        fitButton.addEventListener ('click', () => {
            if (this.callbacks && this.callbacks.onFitAnnotation) {
                this.callbacks.onFitAnnotation (annotation.id);
            }
        });

        let deleteButton = AddDiv (buttonsDiv, 'ov_annotations_button delete', '');
        deleteButton.title = Loc ('Delete');
        deleteButton.addEventListener ('click', () => {
            if (this.callbacks && this.callbacks.onRemoveAnnotation) {
                this.callbacks.onRemoveAnnotation (annotation.id);
            }
        });

        let positionDiv = AddDiv (itemDiv, 'ov_annotations_item_position');
        let intersection = annotation.GetIntersection ();
        let point = intersection.point;
        positionDiv.innerHTML = 'X: ' + point.x.toFixed (3) + ' | Y: ' + point.y.toFixed (3) + ' | Z: ' + point.z.toFixed (3);

        let noteDiv = AddDiv (itemDiv, 'ov_annotations_item_note');
        let noteLabel = AddDiv (noteDiv, 'ov_annotations_note_label', Loc ('Note') + ':');
        let noteTextarea = CreateDomElement ('textarea', 'ov_annotations_note_textarea');
        noteTextarea.value = annotation.GetNote ();
        noteTextarea.placeholder = Loc ('Enter note here...');
        noteDiv.appendChild (noteTextarea);

        noteTextarea.addEventListener ('input', () => {
            noteTextarea.style.height = 'auto';
            noteTextarea.style.height = noteTextarea.scrollHeight + 'px';
        });

        noteTextarea.addEventListener ('change', () => {
            if (this.callbacks && this.callbacks.onUpdateAnnotationNote) {
                this.callbacks.onUpdateAnnotationNote (annotation.id, noteTextarea.value);
            }
        });

        itemDiv.addEventListener ('click', (event) => {
            if (event.target === noteTextarea || event.target === labelInput ||
                event.target === fitButton || event.target === deleteButton) {
                return;
            }
            this.SelectAnnotation (annotation.id);
        });

        setTimeout (() => {
            noteTextarea.style.height = 'auto';
            noteTextarea.style.height = noteTextarea.scrollHeight + 'px';
        }, 0);
    }

    SelectAnnotation (id)
    {
        this.selectedAnnotationId = id;
        this.UpdateContent ();
    }

    Resize ()
    {
        super.Resize ();
    }
}
