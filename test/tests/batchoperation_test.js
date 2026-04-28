import * as assert from 'assert';
import { SetupDOMEnvironment, CleanupDOMEnvironment } from '../utils/domenv.js';

export default function suite ()
{

describe ('Node Item Visibility and Callbacks', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('NodeItem default is visible', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let nodeItem = new NodeItem ('Test Node', 1, callbacks, { hasCheckbox: true });

        assert.strictEqual (nodeItem.IsVisible (), true);
        assert.strictEqual (nodeItem.GetName (), 'Test Node');
        assert.strictEqual (nodeItem.GetNodeId (), 1);
    });

    it ('NodeItem SetVisible changes visibility state', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let nodeItem = new NodeItem ('Test Node', 1, callbacks, { hasCheckbox: true });

        assert.strictEqual (nodeItem.IsVisible (), true);
        nodeItem.SetVisible (false, 0);
        assert.strictEqual (nodeItem.IsVisible (), false);
        nodeItem.SetVisible (true, 0);
        assert.strictEqual (nodeItem.IsVisible (), true);
    });

    it ('NodeItem SetVisible with same value does nothing', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let callbackCalls = 0;
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onVisibilityChanged: (visible) => {
                callbackCalls++;
            }
        };

        let nodeItem = new NodeItem ('Test Node', 1, callbacks, { hasCheckbox: true });

        assert.strictEqual (nodeItem.IsVisible (), true);
        nodeItem.SetVisible (true, 0);
        assert.strictEqual (callbackCalls, 0);
    });

    it ('NodeItem onVisibilityChanged callback is triggered when visibility changes', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let callbackHistory = [];
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onVisibilityChanged: (visible) => {
                callbackHistory.push (visible);
            }
        };

        let nodeItem = new NodeItem ('Test Node', 1, callbacks, { hasCheckbox: true });

        assert.strictEqual (callbackHistory.length, 0);

        nodeItem.SetVisible (false, 0);
        assert.strictEqual (callbackHistory.length, 1);
        assert.strictEqual (callbackHistory[0], false);

        nodeItem.SetVisible (true, 0);
        assert.strictEqual (callbackHistory.length, 2);
        assert.strictEqual (callbackHistory[1], true);
    });

    it ('NodeItem recursive visibility with NavigatorItemRecurse.Children', async function () {
        const { NodeItem, NavigatorItemRecurse } = await import ('../../source/website/navigatoritems.js');

        let parentCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let childVisibleHistory = [];
        let childCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onVisibilityChanged: (visible) => {
                childVisibleHistory.push (visible);
            }
        };

        let parent = new NodeItem ('Parent', 1, parentCallbacks, { hasCheckbox: true });
        let child = new NodeItem ('Child', 2, childCallbacks, { hasCheckbox: true });

        parent.AddChild (child);

        assert.strictEqual (parent.IsVisible (), true);
        assert.strictEqual (child.IsVisible (), true);

        parent.SetVisible (false, NavigatorItemRecurse.Children);

        assert.strictEqual (parent.IsVisible (), false);
        assert.strictEqual (child.IsVisible (), false);
        assert.strictEqual (childVisibleHistory.length, 1);
        assert.strictEqual (childVisibleHistory[0], false);
    });

    it ('NodeItem CalculateIsVisible with children', async function () {
        const { NodeItem, NavigatorItemRecurse } = await import ('../../source/website/navigatoritems.js');

        let parentCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let child1Callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let child2Callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let parent = new NodeItem ('Parent', 1, parentCallbacks, { hasCheckbox: true });
        let child1 = new NodeItem ('Child 1', 2, child1Callbacks, { hasCheckbox: true });
        let child2 = new NodeItem ('Child 2', 3, child2Callbacks, { hasCheckbox: true });

        parent.AddChild (child1);
        parent.AddChild (child2);

        assert.strictEqual (parent.CalculateIsVisible (), true);

        child1.SetVisible (false, NavigatorItemRecurse.No);
        assert.strictEqual (parent.CalculateIsVisible (), true);

        child2.SetVisible (false, NavigatorItemRecurse.No);
        assert.strictEqual (parent.CalculateIsVisible (), false);
    });

});

describe ('Mesh Item Visibility', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('MeshItem default is visible', async function () {
        const { MeshItem, MeshInstanceId } = await import ('../../source/website/navigatoritems.js');

        let meshInstanceId = new MeshInstanceId (1, 0);
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onSelected: () => {}
        };

        let meshItem = new MeshItem ('Test Mesh', 'tree_mesh', meshInstanceId, callbacks, { hasCheckbox: true });

        assert.strictEqual (meshItem.IsVisible (), true);
        assert.strictEqual (meshItem.GetName (), 'Test Mesh');
        assert.strictEqual (meshItem.GetMeshInstanceId (), meshInstanceId);
    });

    it ('MeshItem SetVisible changes visibility state', async function () {
        const { MeshItem, MeshInstanceId } = await import ('../../source/website/navigatoritems.js');

        let meshInstanceId = new MeshInstanceId (1, 0);
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onSelected: () => {}
        };

        let meshItem = new MeshItem ('Test Mesh', 'tree_mesh', meshInstanceId, callbacks, { hasCheckbox: true });

        assert.strictEqual (meshItem.IsVisible (), true);
        meshItem.SetVisible (false, 0);
        assert.strictEqual (meshItem.IsVisible (), false);
        meshItem.SetVisible (true, 0);
        assert.strictEqual (meshItem.IsVisible (), true);
    });

    it ('MeshItem SetVisible with same value does nothing', async function () {
        const { MeshItem, MeshInstanceId } = await import ('../../source/website/navigatoritems.js');

        let meshInstanceId = new MeshInstanceId (1, 0);
        let callbackCalled = false;
        let callbacks = {
            onShowHide: () => {
                callbackCalled = true;
            },
            onFitToWindow: () => {},
            onSelected: () => {}
        };

        let meshItem = new MeshItem ('Test Mesh', 'tree_mesh', meshInstanceId, callbacks, { hasCheckbox: true });

        meshItem.SetVisible (true, 0);
        assert.strictEqual (callbackCalled, false);
    });

});

describe ('Checkbox and Batch Operations Logic', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('NodeItem checkbox state changes', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let nodeItem = new NodeItem ('Test Node', 1, callbacks, { hasCheckbox: true });

        assert.strictEqual (nodeItem.IsChecked (), false);
        nodeItem.SetChecked (true);
        assert.strictEqual (nodeItem.IsChecked (), true);
        nodeItem.SetChecked (false);
        assert.strictEqual (nodeItem.IsChecked (), false);
    });

    it ('NodeItem onCheckboxChange callback', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let checkboxHistory = [];
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onCheckboxChange: (item, checked) => {
                checkboxHistory.push ({ item, checked });
            }
        };

        let nodeItem = new NodeItem ('Test Node', 1, callbacks, { hasCheckbox: true });

        nodeItem.SetChecked (true);
        assert.strictEqual (checkboxHistory.length, 1);
        assert.strictEqual (checkboxHistory[0].item, nodeItem);
        assert.strictEqual (checkboxHistory[0].checked, true);

        nodeItem.SetChecked (false);
        assert.strictEqual (checkboxHistory.length, 2);
        assert.strictEqual (checkboxHistory[1].checked, false);
    });

    it ('MeshItem checkbox state changes', async function () {
        const { MeshItem, MeshInstanceId } = await import ('../../source/website/navigatoritems.js');

        let meshInstanceId = new MeshInstanceId (1, 0);
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onSelected: () => {}
        };

        let meshItem = new MeshItem ('Test Mesh', 'tree_mesh', meshInstanceId, callbacks, { hasCheckbox: true });

        assert.strictEqual (meshItem.IsChecked (), false);
        meshItem.SetChecked (true);
        assert.strictEqual (meshItem.IsChecked (), true);
        meshItem.SetChecked (false);
        assert.strictEqual (meshItem.IsChecked (), false);
    });

    it ('MeshItem onCheckboxChange callback', async function () {
        const { MeshItem, MeshInstanceId } = await import ('../../source/website/navigatoritems.js');

        let meshInstanceId = new MeshInstanceId (1, 0);
        let checkboxHistory = [];
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onSelected: () => {},
            onCheckboxChange: (item, checked) => {
                checkboxHistory.push ({ item, checked });
            }
        };

        let meshItem = new MeshItem ('Test Mesh', 'tree_mesh', meshInstanceId, callbacks, { hasCheckbox: true });

        meshItem.SetChecked (true);
        assert.strictEqual (checkboxHistory.length, 1);
        assert.strictEqual (checkboxHistory[0].item, meshItem);
        assert.strictEqual (checkboxHistory[0].checked, true);
    });

    it ('NodeItem EnumerateAllItems recursive', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let parentCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let childCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let root = new NodeItem ('Root', 0, parentCallbacks, { hasCheckbox: true });
        let node1 = new NodeItem ('Node 1', 1, childCallbacks, { hasCheckbox: true });
        let node2 = new NodeItem ('Node 2', 2, childCallbacks, { hasCheckbox: true });

        root.AddChild (node1);
        root.AddChild (node2);

        let enumerated = [];
        root.EnumerateAllItems ((item) => {
            enumerated.push (item.GetName ());
            return true;
        });

        assert.deepStrictEqual (enumerated, ['Root', 'Node 1', 'Node 2']);
    });

    it ('NodeItem EnumerateAllItems stops on false', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let parentCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let childCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {}
        };

        let root = new NodeItem ('Root', 0, parentCallbacks, { hasCheckbox: true });
        let node1 = new NodeItem ('Node 1', 1, childCallbacks, { hasCheckbox: true });
        let node2 = new NodeItem ('Node 2', 2, childCallbacks, { hasCheckbox: true });

        root.AddChild (node1);
        root.AddChild (node2);

        let enumerated = [];
        root.EnumerateAllItems ((item) => {
            enumerated.push (item.GetName ());
            return item.GetName () !== 'Node 1';
        });

        assert.deepStrictEqual (enumerated, ['Root', 'Node 1']);
    });

});

describe ('Batch Visibility Change - Callback Chain', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('Simulate SetSelectedItemsVisibility: hide checked items', async function () {
        const { NodeItem, MeshItem, MeshInstanceId, NavigatorItemRecurse } = await import ('../../source/website/navigatoritems.js');

        let visibilityChanges = [];

        let parentCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onVisibilityChanged: (visible) => {
                visibilityChanges.push ({ node: 'Parent', visible: visible });
            }
        };

        let meshCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onSelected: () => {}
        };

        let parent = new NodeItem ('Parent Node', 1, parentCallbacks, { hasCheckbox: true });
        let meshInstanceId = new MeshInstanceId (1, 0);
        let mesh = new MeshItem ('Child Mesh', 'tree_mesh', meshInstanceId, meshCallbacks, { hasCheckbox: true });

        parent.AddChild (mesh);

        mesh.SetChecked (true);
        parent.SetChecked (false);

        let checkedItems = [];
        if (parent.IsChecked ()) {
            checkedItems.push (parent);
        }
        parent.EnumerateAllItems ((item) => {
            if (item.IsChecked ()) {
                checkedItems.push (item);
            }
            return true;
        });

        assert.strictEqual (checkedItems.length, 1);
        assert.strictEqual (checkedItems[0].GetName (), 'Child Mesh');

        for (let item of checkedItems) {
            item.SetVisible (false, NavigatorItemRecurse.No);
        }

        assert.strictEqual (visibilityChanges.length, 0);
        assert.strictEqual (mesh.IsVisible (), false);
    });

    it ('Simulate SetSelectedItemsVisibility: show checked items with recursive children', async function () {
        const { NodeItem, NavigatorItemRecurse } = await import ('../../source/website/navigatoritems.js');

        let allVisibilityChanges = [];

        let rootCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onVisibilityChanged: (visible) => {
                allVisibilityChanges.push ({ node: 'Root', visible: visible });
            }
        };

        let childCallbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onVisibilityChanged: (visible) => {
                allVisibilityChanges.push ({ node: 'Child', visible: visible });
            }
        };

        let root = new NodeItem ('Root Node', 0, rootCallbacks, { hasCheckbox: true });
        let child = new NodeItem ('Child Node', 1, childCallbacks, { hasCheckbox: true });

        root.AddChild (child);

        child.SetVisible (false, NavigatorItemRecurse.No);
        root.SetVisible (false, NavigatorItemRecurse.No);

        assert.strictEqual (allVisibilityChanges.length, 2);

        allVisibilityChanges = [];

        root.SetChecked (true);

        if (root.IsChecked ()) {
            root.SetVisible (true, NavigatorItemRecurse.Children);
        }

        assert.strictEqual (allVisibilityChanges.length, 2);
        assert.strictEqual (root.IsVisible (), true);
        assert.strictEqual (child.IsVisible (), true);
    });

    it ('onNameChange callback for NodeItem', async function () {
        const { NodeItem } = await import ('../../source/website/navigatoritems.js');

        let nameChangeHistory = [];
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onNameChange: (item, newName, oldName) => {
                nameChangeHistory.push ({ item, newName, oldName });
            }
        };

        let nodeItem = new NodeItem ('Old Name', 1, callbacks, { hasCheckbox: true, editable: true });

        assert.strictEqual (nodeItem.GetName (), 'Old Name');

        nodeItem.SetName ('New Name');
        assert.strictEqual (nodeItem.GetName (), 'New Name');
        assert.strictEqual (nameChangeHistory.length, 0);
    });

    it ('onNameChange callback for MeshItem', async function () {
        const { MeshItem, MeshInstanceId } = await import ('../../source/website/navigatoritems.js');

        let meshInstanceId = new MeshInstanceId (1, 0);
        let nameChangeHistory = [];
        let callbacks = {
            onShowHide: () => {},
            onFitToWindow: () => {},
            onSelected: () => {},
            onNameChange: (item, newName, oldName) => {
                nameChangeHistory.push ({ item, newName, oldName });
            }
        };

        let meshItem = new MeshItem ('Old Mesh Name', 'tree_mesh', meshInstanceId, callbacks, { hasCheckbox: true, editable: true });

        assert.strictEqual (meshItem.GetName (), 'Old Mesh Name');

        meshItem.SetName ('New Mesh Name');
        assert.strictEqual (meshItem.GetName (), 'New Mesh Name');
        assert.strictEqual (nameChangeHistory.length, 0);
    });

});

}
