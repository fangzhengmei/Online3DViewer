import { IsDefined } from '../engine/core/core.js';
import { TreeViewButton, TreeViewButtonItem, TreeViewGroupButtonItem, TreeViewSingleItem } from './treeview.js';

export const NavigatorItemRecurse =
{
    No : 0,
    Parents : 1,
    Children : 2,
    All : 3
};

export class MaterialItem extends TreeViewSingleItem
{
    constructor (name, materialIndex, callbacks)
    {
        super (name);
        this.OnClick (() => {
            callbacks.onSelected (materialIndex);
        });
    }
}

export class MeshItem extends TreeViewButtonItem
{
    constructor (name, icon, meshInstanceId, callbacks, options = {})
    {
        const treeViewOptions = {
            hasCheckbox : options.hasCheckbox || false,
            editable : options.editable || false
        };
        super (name, icon, treeViewOptions);

        this.meshInstanceId = meshInstanceId;
        this.callbacks = callbacks;
        this.visible = true;

        this.fitToWindowButton = new TreeViewButton ('fit');
        this.fitToWindowButton.OnClick (() => {
            callbacks.onFitToWindow (this.meshInstanceId);
        });
        this.AppendButton (this.fitToWindowButton);

        this.showHideButton = new TreeViewButton ('visible');
        this.showHideButton.OnClick (() => {
            callbacks.onShowHide (this.meshInstanceId);
        });
        this.AppendButton (this.showHideButton);

        this.OnClick (() => {
            callbacks.onSelected (this.meshInstanceId);
        });

        if (treeViewOptions.hasCheckbox) {
            this.OnCheckboxChange ((checked) => {
                if (IsDefined (this.callbacks.onCheckboxChange)) {
                    this.callbacks.onCheckboxChange (this, checked);
                }
            });
        }

        if (treeViewOptions.editable) {
            this.OnNameChange ((newName, oldName) => {
                if (IsDefined (this.callbacks.onNameChange)) {
                    this.callbacks.onNameChange (this, newName, oldName);
                }
            });
        }
    }

    GetMeshInstanceId ()
    {
        return this.meshInstanceId;
    }

    IsVisible ()
    {
        return this.visible;
    }

    SetVisible (visible, recurse)
    {
        if (this.visible === visible) {
            return;
        }
        this.visible = visible;
        if (this.visible) {
            this.showHideButton.SetImage ('visible');
        } else {
            this.showHideButton.SetImage ('hidden');
        }
        if (recurse === NavigatorItemRecurse.Parents) {
            if (this.parent instanceof NodeItem) {
                let parentIsVisible = this.parent.CalculateIsVisible ();
                this.parent.SetVisible (parentIsVisible, NavigatorItemRecurse.Parents);
            }
        }
    }
}

export class NodeItem extends TreeViewGroupButtonItem
{
    constructor (name, nodeId, callbacks, options = {})
    {
        const treeViewOptions = {
            hasCheckbox : options.hasCheckbox || false,
            editable : options.editable || false
        };
        super (name, null, treeViewOptions);
        this.nodeId = nodeId;
        this.callbacks = callbacks;
        this.visible = true;

        this.fitToWindowButton = new TreeViewButton ('fit');
        this.fitToWindowButton.OnClick (() => {
            this.callbacks.onFitToWindow (nodeId);
        });
        this.AppendButton (this.fitToWindowButton);

        this.showHideButton = new TreeViewButton ('visible');
        this.showHideButton.OnClick (() => {
            this.callbacks.onShowHide (nodeId);
        });
        this.AppendButton (this.showHideButton);

        if (treeViewOptions.hasCheckbox) {
            this.OnCheckboxChange ((checked) => {
                if (IsDefined (this.callbacks.onCheckboxChange)) {
                    this.callbacks.onCheckboxChange (this, checked);
                }
            });
        }

        if (treeViewOptions.editable) {
            this.OnNameChange ((newName, oldName) => {
                if (IsDefined (this.callbacks.onNameChange)) {
                    this.callbacks.onNameChange (this, newName, oldName);
                }
            });
        }
    }

    GetNodeId ()
    {
        return this.nodeId;
    }

    IsVisible ()
    {
        return this.visible;
    }

    CalculateIsVisible ()
    {
        let isVisible = false;
        for (let child of this.children) {
            if (child instanceof NodeItem || child instanceof MeshItem) {
                if (child.IsVisible ()) {
                    isVisible = true;
                    break;
                }
            }
        }
        return isVisible;
    }

    SetVisible (visible, recurse)
    {
        if (this.visible === visible) {
            return;
        }
        this.visible = visible;
        if (this.visible) {
            this.showHideButton.SetImage ('visible');
        } else {
            this.showHideButton.SetImage ('hidden');
        }
        if (IsDefined (this.callbacks.onVisibilityChanged)) {
            this.callbacks.onVisibilityChanged (this.visible);
        }
        if (recurse === NavigatorItemRecurse.Children || recurse === NavigatorItemRecurse.All) {
            for (let child of this.children) {
                if (child instanceof NodeItem || child instanceof MeshItem) {
                    child.SetVisible (this.visible, NavigatorItemRecurse.Children);
                }
            }
        }
        if (recurse === NavigatorItemRecurse.Parents || recurse === NavigatorItemRecurse.All) {
            if (this.parent instanceof NodeItem) {
                let parentIsVisible = this.parent.CalculateIsVisible ();
                this.parent.SetVisible (parentIsVisible, NavigatorItemRecurse.Parents);
            }
        }
    }

    EnumerateMeshItems (processor)
    {
        for (let child of this.children) {
            if (child instanceof NodeItem) {
                child.EnumerateMeshItems (processor);
            } else if (child instanceof MeshItem) {
                processor (child);
            }
        }
    }

    EnumerateAllItems (processor)
    {
        if (!processor (this)) {
            return;
        }
        for (let child of this.children) {
            if (child instanceof NodeItem) {
                child.EnumerateAllItems (processor);
            } else if (child instanceof MeshItem) {
                processor (child);
            }
        }
    }
}
