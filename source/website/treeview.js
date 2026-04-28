import { IsDefined } from '../engine/core/core.js';
import { AddDiv, CreateDiv, ShowDomElement, ClearDomElement, InsertDomElementBefore, InsertDomElementAfter } from '../engine/viewer/domutils.js';
import { CreateSvgIconElement, SetSvgIconImageElement } from './utils.js';

export function ScrollToView (element)
{
    element.scrollIntoView ({
        behavior : 'smooth',
        block : 'nearest'
    });
}

export class TreeViewCheckbox
{
    constructor (checked = false)
    {
        this.checked = checked;
        this.mainElement = CreateDiv ('ov_tree_item_checkbox');
        this.mainElement.addEventListener ('click', (ev) => {
            ev.stopPropagation ();
            this.Toggle ();
        });
        this.UpdateVisualState ();
    }

    IsChecked ()
    {
        return this.checked;
    }

    SetChecked (checked, triggerEvent = true)
    {
        if (this.checked === checked) {
            return;
        }
        this.checked = checked;
        this.UpdateVisualState ();
        if (triggerEvent && IsDefined (this.onChange)) {
            this.onChange (this.checked);
        }
    }

    Toggle ()
    {
        this.SetChecked (!this.checked);
    }

    OnChange (handler)
    {
        this.onChange = handler;
    }

    UpdateVisualState ()
    {
        if (this.checked) {
            this.mainElement.classList.add ('checked');
        } else {
            this.mainElement.classList.remove ('checked');
        }
    }

    GetDomElement ()
    {
        return this.mainElement;
    }
}

export class TreeViewButton
{
    constructor (imagePath)
    {
        this.imagePath = imagePath;
        this.mainElement = CreateSvgIconElement (this.imagePath, 'ov_tree_item_button');
        this.mainElement.setAttribute ('src', this.imagePath);
    }

    SetImage (imagePath)
    {
        this.imagePath = imagePath;
        SetSvgIconImageElement (this.mainElement, this.imagePath);
    }

    OnClick (clickHandler)
    {
        this.mainElement.addEventListener ('click', (ev) => {
            ev.stopPropagation ();
            clickHandler (ev);
        });
    }

    GetDomElement ()
    {
        return this.mainElement;
    }
}

export class TreeViewItem
{
    constructor (name, icon, options = {})
    {
        this.name = name;
        this.parent = null;
        this.editable = options.editable || false;
        this.hasCheckbox = options.hasCheckbox || false;
        this.checkbox = null;
        this.isEditing = false;
        this.editInput = null;

        this.mainElement = CreateDiv ('ov_tree_item');
        this.mainElement.setAttribute ('title', this.name);

        this.nameElement = AddDiv (this.mainElement, 'ov_tree_item_name', this.name);

        if (this.hasCheckbox) {
            this.checkbox = new TreeViewCheckbox ();
            InsertDomElementBefore (this.checkbox.GetDomElement (), this.nameElement);
        }

        if (IsDefined (icon)) {
            let iconElement = CreateSvgIconElement (icon, 'ov_tree_item_icon');
            InsertDomElementBefore (iconElement, this.nameElement);
        }

        if (this.editable) {
            this.nameElement.classList.add ('editable');
            this.mainElement.addEventListener ('dblclick', (ev) => {
                if (!this.isEditing) {
                    this.StartEdit ();
                }
            });
        }
    }

    IsChecked ()
    {
        if (this.checkbox === null) {
            return false;
        }
        return this.checkbox.IsChecked ();
    }

    SetChecked (checked, triggerEvent = true)
    {
        if (this.checkbox === null) {
            return;
        }
        this.checkbox.SetChecked (checked, triggerEvent);
    }

    OnCheckboxChange (handler)
    {
        if (this.checkbox !== null) {
            this.checkbox.OnChange (handler);
        }
    }

    OnClick (onClick)
    {
        this.mainElement.classList.add ('clickable');
        this.mainElement.style.cursor = 'pointer';
        this.mainElement.addEventListener ('click', onClick);
    }

    SetParent (parent)
    {
        this.parent = parent;
    }

    AddDomElements (parentDiv)
    {
        parentDiv.appendChild (this.mainElement);
    }

    GetDomElement ()
    {
        return this.mainElement;
    }

    GetName ()
    {
        return this.name;
    }

    SetName (name)
    {
        this.name = name;
        this.nameElement.textContent = name;
        this.mainElement.setAttribute ('title', name);
    }

    StartEdit ()
    {
        if (!this.editable || this.isEditing) {
            return;
        }
        this.isEditing = true;
        this.nameElement.style.display = 'none';
        this.mainElement.classList.add ('editing');

        this.editInput = CreateDiv ('ov_tree_item_edit_input');
        this.editInput.contentEditable = 'true';
        this.editInput.textContent = this.name;
        InsertDomElementAfter (this.editInput, this.nameElement);

        this.editInput.focus ();
        const range = document.createRange ();
        range.selectNodeContents (this.editInput);
        const selection = window.getSelection ();
        selection.removeAllRanges ();
        selection.addRange (range);

        const finishEdit = () => {
            this.FinishEdit (true);
        };

        const cancelEdit = () => {
            this.FinishEdit (false);
        };

        this.editInput.addEventListener ('blur', cancelEdit);
        this.editInput.addEventListener ('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault ();
                this.editInput.removeEventListener ('blur', cancelEdit);
                finishEdit ();
            } else if (ev.key === 'Escape') {
                this.editInput.removeEventListener ('blur', cancelEdit);
                cancelEdit ();
            }
        });
    }

    FinishEdit (accept)
    {
        if (!this.isEditing) {
            return;
        }

        let newName = this.name;
        if (accept && this.editInput !== null) {
            const inputValue = this.editInput.textContent.trim ();
            if (inputValue.length > 0) {
                newName = inputValue;
            }
        }

        if (accept && newName !== this.name && IsDefined (this.onNameChange)) {
            this.onNameChange (newName, this.name);
        }

        if (this.editInput !== null) {
            this.editInput.remove ();
            this.editInput = null;
        }

        this.nameElement.style.display = '';
        this.mainElement.classList.remove ('editing');
        this.isEditing = false;
    }

    OnNameChange (handler)
    {
        this.onNameChange = handler;
    }
}

export class TreeViewSingleItem extends TreeViewItem
{
    constructor (name, icon, options = {})
    {
        super (name, icon, options);
        this.selected = false;
    }

    SetSelected (selected)
    {
        this.selected = selected;
        if (this.selected) {
            this.mainElement.classList.add ('selected');
            let parent = this.parent;
            if (parent === null) {
                ScrollToView (this.mainElement);
            } else {
                while (parent !== null) {
                    parent.ShowChildren (true);
                    ScrollToView (this.mainElement);
                    parent = parent.parent;
                }
            }
        } else {
            this.mainElement.classList.remove ('selected');
        }
    }
}

export class TreeViewButtonItem extends TreeViewSingleItem
{
    constructor (name, icon, options = {})
    {
        super (name, icon, options);
        this.buttonsDiv = CreateDiv ('ov_tree_item_button_container');
        InsertDomElementBefore (this.buttonsDiv, this.nameElement);
    }

    AppendButton (button)
    {
        this.buttonsDiv.appendChild (button.GetDomElement ());
    }
}

export class TreeViewGroupItem extends TreeViewItem
{
    constructor (name, icon, options = {})
    {
        super (name, icon, options);
        this.children = [];
        this.isVisible = true;
        this.isChildrenVisible = false;

        this.childrenDiv = null;
        this.openButtonIcon = 'arrow_down';
        this.closeButtonIcon = 'arrow_right';

        this.openCloseButton = CreateSvgIconElement (this.openButtonIcon, 'ov_tree_item_icon');
        InsertDomElementBefore (this.openCloseButton, this.nameElement);
    }

    AddChild (child)
    {
        this.CreateChildrenDiv ();
        this.children.push (child);
        child.SetParent (this);
        child.AddDomElements (this.childrenDiv);
    }

    ExpandAll (expand)
    {
        for (let child of this.children) {
            if (child instanceof TreeViewGroupItem) {
                child.ShowChildren (expand);
                child.ExpandAll (expand);
            }
        }
    }

    Show (show)
    {
        this.isVisible = show;
        if (this.childrenDiv === null) {
            return;
        }
        if (this.isVisible) {
            ShowDomElement (this.mainElement, true);
            this.childrenDiv.classList.add ('ov_tree_view_children');
        } else {
            ShowDomElement (this.mainElement, false);
            this.childrenDiv.classList.remove ('ov_tree_view_children');
        }
    }

    ShowChildren (show)
    {
        this.isChildrenVisible = show;
        if (this.childrenDiv === null) {
            return;
        }
        if (show) {
            SetSvgIconImageElement (this.openCloseButton, this.openButtonIcon);
            ShowDomElement (this.childrenDiv, true);
        } else {
            SetSvgIconImageElement (this.openCloseButton, this.closeButtonIcon);
            ShowDomElement (this.childrenDiv, false);
        }
    }

    CreateChildrenDiv ()
    {
        if (this.childrenDiv === null) {
            this.childrenDiv = CreateDiv ('ov_tree_view_children');
            InsertDomElementAfter (this.childrenDiv, this.mainElement);
            this.Show (this.isVisible);
            this.ShowChildren (this.isChildrenVisible);
            this.OnClick ((ev) => {
                this.isChildrenVisible = !this.isChildrenVisible;
                this.ShowChildren (this.isChildrenVisible);
            });
        }
        return this.childrenDiv;
    }

    EnumerateChildren (processor, recursive = true)
    {
        for (let child of this.children) {
            if (processor (child) === false) {
                return;
            }
            if (recursive && child instanceof TreeViewGroupItem) {
                child.EnumerateChildren (processor, recursive);
            }
        }
    }

    SetCheckedRecursive (checked)
    {
        this.SetChecked (checked, false);
        this.EnumerateChildren ((child) => {
            if (child instanceof TreeViewItem) {
                child.SetChecked (checked, false);
            }
        }, true);
    }

    GetCheckedChildCount ()
    {
        let count = 0;
        if (this.IsChecked ()) {
            count += 1;
        }
        this.EnumerateChildren ((child) => {
            if (child instanceof TreeViewItem && child.IsChecked ()) {
                count += 1;
            }
        }, true);
        return count;
    }

    GetCheckedItems ()
    {
        let items = [];
        if (this.IsChecked ()) {
            items.push (this);
        }
        this.EnumerateChildren ((child) => {
            if (child instanceof TreeViewItem && child.IsChecked ()) {
                items.push (child);
            }
        }, true);
        return items;
    }
}

export class TreeViewGroupButtonItem extends TreeViewGroupItem
{
    constructor (name, icon, options = {})
    {
        super (name, icon, options);
        this.buttonsDiv = CreateDiv ('ov_tree_item_button_container');
        InsertDomElementBefore (this.buttonsDiv, this.nameElement);
    }

    AppendButton (button)
    {
        this.buttonsDiv.appendChild (button.GetDomElement ());
    }
}

export class TreeView
{
    constructor (parentDiv)
    {
        this.mainDiv = AddDiv (parentDiv, 'ov_tree_view');
        this.children = [];
    }

    AddClass (className)
    {
        this.mainDiv.classList.add (className);
    }

    AddChild (child)
    {
        child.AddDomElements (this.mainDiv);
        this.children.push (child);
    }

    Clear ()
    {
        ClearDomElement (this.mainDiv);
        this.children = [];
    }
}
