import * as assert from 'assert';
import { SetupDOMEnvironment, CleanupDOMEnvironment, SimulateClick } from '../utils/domenv.js';

import { TreeViewCheckbox, TreeViewItem, TreeViewSingleItem, TreeViewButtonItem, TreeViewGroupItem, TreeViewGroupButtonItem, ScrollToView } from '../../source/website/treeview.js';

export default function suite ()
{

describe ('TreeViewCheckbox', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('Default Initialization', function () {
        let checkbox = new TreeViewCheckbox ();
        assert.strictEqual (checkbox.IsChecked (), false);
        assert.ok (checkbox.GetDomElement () !== null);
        assert.strictEqual (checkbox.GetDomElement ().classList.contains ('checked'), false);
    });

    it ('Initialization with checked state', function () {
        let checkbox = new TreeViewCheckbox (true);
        assert.strictEqual (checkbox.IsChecked (), true);
        assert.strictEqual (checkbox.GetDomElement ().classList.contains ('checked'), true);
    });

    it ('Toggle checkbox state', function () {
        let checkbox = new TreeViewCheckbox ();
        assert.strictEqual (checkbox.IsChecked (), false);
        checkbox.Toggle ();
        assert.strictEqual (checkbox.IsChecked (), true);
        assert.strictEqual (checkbox.GetDomElement ().classList.contains ('checked'), true);
        checkbox.Toggle ();
        assert.strictEqual (checkbox.IsChecked (), false);
        assert.strictEqual (checkbox.GetDomElement ().classList.contains ('checked'), false);
    });

    it ('SetChecked method', function () {
        let checkbox = new TreeViewCheckbox ();
        checkbox.SetChecked (true);
        assert.strictEqual (checkbox.IsChecked (), true);
        checkbox.SetChecked (false);
        assert.strictEqual (checkbox.IsChecked (), false);
    });

    it ('SetChecked with same value does nothing', function () {
        let checkbox = new TreeViewCheckbox (true);
        let callbackCalled = false;
        checkbox.OnChange (() => {
            callbackCalled = true;
        });
        checkbox.SetChecked (true);
        assert.strictEqual (callbackCalled, false);
    });

    it ('OnChange callback is triggered on state change', function () {
        let checkbox = new TreeViewCheckbox ();
        let callbackCalled = false;
        let newState = null;
        checkbox.OnChange ((state) => {
            callbackCalled = true;
            newState = state;
        });
        checkbox.SetChecked (true);
        assert.strictEqual (callbackCalled, true);
        assert.strictEqual (newState, true);
    });

    it ('OnChange callback not triggered when triggerEvent is false', function () {
        let checkbox = new TreeViewCheckbox ();
        let callbackCalled = false;
        checkbox.OnChange (() => {
            callbackCalled = true;
        });
        checkbox.SetChecked (true, false);
        assert.strictEqual (callbackCalled, false);
        assert.strictEqual (checkbox.IsChecked (), true);
    });

    it ('Click event toggles state', function () {
        let checkbox = new TreeViewCheckbox ();
        assert.strictEqual (checkbox.IsChecked (), false);
        SimulateClick (checkbox.GetDomElement ());
        assert.strictEqual (checkbox.IsChecked (), true);
        SimulateClick (checkbox.GetDomElement ());
        assert.strictEqual (checkbox.IsChecked (), false);
    });

});

describe ('TreeViewItem', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('Default Initialization', function () {
        let item = new TreeViewItem ('Test Item');
        assert.strictEqual (item.GetName (), 'Test Item');
        assert.ok (item.GetDomElement () !== null);
        assert.strictEqual (item.IsChecked (), false);
        assert.strictEqual (item.checkbox, null);
    });

    it ('Initialization with icon', function () {
        let item = new TreeViewItem ('Test Item', 'some_icon');
        assert.strictEqual (item.GetName (), 'Test Item');
        assert.ok (item.GetDomElement () !== null);
    });

    it ('Initialization with hasCheckbox option', function () {
        let item = new TreeViewItem ('Test Item', null, { hasCheckbox: true });
        assert.ok (item.checkbox !== null);
        assert.strictEqual (item.IsChecked (), false);
    });

    it ('Initialization with editable option', function () {
        let item = new TreeViewItem ('Test Item', null, { editable: true });
        assert.strictEqual (item.editable, true);
    });

    it ('SetName and GetName', function () {
        let item = new TreeViewItem ('Old Name');
        assert.strictEqual (item.GetName (), 'Old Name');
        item.SetName ('New Name');
        assert.strictEqual (item.GetName (), 'New Name');
    });

    it ('SetChecked with hasCheckbox option', function () {
        let item = new TreeViewItem ('Test Item', null, { hasCheckbox: true });
        assert.strictEqual (item.IsChecked (), false);
        item.SetChecked (true);
        assert.strictEqual (item.IsChecked (), true);
        item.SetChecked (false);
        assert.strictEqual (item.IsChecked (), false);
    });

    it ('SetChecked without hasCheckbox does nothing', function () {
        let item = new TreeViewItem ('Test Item');
        assert.strictEqual (item.checkbox, null);
        item.SetChecked (true);
        assert.strictEqual (item.IsChecked (), false);
    });

    it ('OnCheckboxChange callback', function () {
        let item = new TreeViewItem ('Test Item', null, { hasCheckbox: true });
        let callbackCalled = false;
        let receivedState = null;
        item.OnCheckboxChange ((state) => {
            callbackCalled = true;
            receivedState = state;
        });
        item.SetChecked (true);
        assert.strictEqual (callbackCalled, true);
        assert.strictEqual (receivedState, true);
    });

    it ('OnNameChange callback', function () {
        let item = new TreeViewItem ('Old Name', null, { editable: true });
        let callbackCalled = false;
        let receivedNewName = null;
        let receivedOldName = null;
        item.OnNameChange ((newName, oldName) => {
            callbackCalled = true;
            receivedNewName = newName;
            receivedOldName = oldName;
        });
        item.SetName ('New Name');
        assert.strictEqual (callbackCalled, false);
    });

});

describe ('TreeViewGroupItem', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('Default Initialization', function () {
        let group = new TreeViewGroupItem ('Test Group');
        assert.strictEqual (group.GetName (), 'Test Group');
        assert.ok (group.GetDomElement () !== null);
        assert.strictEqual (group.children.length, 0);
    });

    it ('AddChild', function () {
        let group = new TreeViewGroupItem ('Test Group');
        let child1 = new TreeViewSingleItem ('Child 1');
        let child2 = new TreeViewSingleItem ('Child 2');
        group.AddChild (child1);
        group.AddChild (child2);
        assert.strictEqual (group.children.length, 2);
        assert.strictEqual (group.children[0].GetName (), 'Child 1');
        assert.strictEqual (group.children[1].GetName (), 'Child 2');
        assert.strictEqual (child1.parent, group);
        assert.strictEqual (child2.parent, group);
    });

    it ('EnumerateChildren basic', function () {
        let group = new TreeViewGroupItem ('Root');
        let child1 = new TreeViewSingleItem ('Child 1');
        let child2 = new TreeViewSingleItem ('Child 2');
        group.AddChild (child1);
        group.AddChild (child2);

        let enumerated = [];
        group.EnumerateChildren ((child) => {
            enumerated.push (child.GetName ());
            return true;
        }, false);

        assert.deepStrictEqual (enumerated, ['Child 1', 'Child 2']);
    });

    it ('EnumerateChildren recursive', function () {
        let root = new TreeViewGroupItem ('Root', null, { hasCheckbox: true });
        let group1 = new TreeViewGroupItem ('Group 1', null, { hasCheckbox: true });
        let group2 = new TreeViewGroupItem ('Group 2', null, { hasCheckbox: true });
        let child1 = new TreeViewSingleItem ('Child 1', null, { hasCheckbox: true });
        let child2 = new TreeViewSingleItem ('Child 2', null, { hasCheckbox: true });

        root.AddChild (group1);
        root.AddChild (group2);
        group1.AddChild (child1);
        group2.AddChild (child2);

        let enumerated = [];
        root.EnumerateChildren ((child) => {
            enumerated.push (child.GetName ());
            return true;
        }, true);

        assert.deepStrictEqual (enumerated, ['Group 1', 'Child 1', 'Group 2', 'Child 2']);
    });

    it ('EnumerateChildren returns false stops enumeration', function () {
        let group = new TreeViewGroupItem ('Root');
        let child1 = new TreeViewSingleItem ('Child 1');
        let child2 = new TreeViewSingleItem ('Child 2');
        let child3 = new TreeViewSingleItem ('Child 3');
        group.AddChild (child1);
        group.AddChild (child2);
        group.AddChild (child3);

        let enumerated = [];
        group.EnumerateChildren ((child) => {
            enumerated.push (child.GetName ());
            return child.GetName () !== 'Child 2';
        }, false);

        assert.deepStrictEqual (enumerated, ['Child 1', 'Child 2']);
    });

    it ('SetCheckedRecursive with checkbox enabled', function () {
        let root = new TreeViewGroupItem ('Root', null, { hasCheckbox: true });
        let group1 = new TreeViewGroupItem ('Group 1', null, { hasCheckbox: true });
        let child1 = new TreeViewSingleItem ('Child 1', null, { hasCheckbox: true });
        let child2 = new TreeViewSingleItem ('Child 2', null, { hasCheckbox: true });

        root.AddChild (group1);
        group1.AddChild (child1);
        group1.AddChild (child2);

        assert.strictEqual (root.IsChecked (), false);
        assert.strictEqual (group1.IsChecked (), false);
        assert.strictEqual (child1.IsChecked (), false);
        assert.strictEqual (child2.IsChecked (), false);

        root.SetCheckedRecursive (true);

        assert.strictEqual (root.IsChecked (), true);
        assert.strictEqual (group1.IsChecked (), true);
        assert.strictEqual (child1.IsChecked (), true);
        assert.strictEqual (child2.IsChecked (), true);

        root.SetCheckedRecursive (false);

        assert.strictEqual (root.IsChecked (), false);
        assert.strictEqual (group1.IsChecked (), false);
        assert.strictEqual (child1.IsChecked (), false);
        assert.strictEqual (child2.IsChecked (), false);
    });

    it ('GetCheckedChildCount', function () {
        let root = new TreeViewGroupItem ('Root', null, { hasCheckbox: true });
        let group1 = new TreeViewGroupItem ('Group 1', null, { hasCheckbox: true });
        let child1 = new TreeViewSingleItem ('Child 1', null, { hasCheckbox: true });
        let child2 = new TreeViewSingleItem ('Child 2', null, { hasCheckbox: true });

        root.AddChild (group1);
        group1.AddChild (child1);
        group1.AddChild (child2);

        assert.strictEqual (root.GetCheckedChildCount (), 0);

        child1.SetChecked (true);
        assert.strictEqual (root.GetCheckedChildCount (), 1);

        group1.SetChecked (true);
        assert.strictEqual (root.GetCheckedChildCount (), 3);

        root.SetCheckedRecursive (true);
        assert.strictEqual (root.GetCheckedChildCount (), 4);
    });

    it ('GetCheckedItems', function () {
        let root = new TreeViewGroupItem ('Root', null, { hasCheckbox: true });
        let group1 = new TreeViewGroupItem ('Group 1', null, { hasCheckbox: true });
        let child1 = new TreeViewSingleItem ('Child 1', null, { hasCheckbox: true });
        let child2 = new TreeViewSingleItem ('Child 2', null, { hasCheckbox: true });

        root.AddChild (group1);
        group1.AddChild (child1);
        group1.AddChild (child2);

        let checked = root.GetCheckedItems ();
        assert.strictEqual (checked.length, 0);

        child1.SetChecked (true);
        child2.SetChecked (true);
        checked = root.GetCheckedItems ();
        assert.strictEqual (checked.length, 2);

        let checkedNames = checked.map (item => item.GetName ());
        assert.ok (checkedNames.includes ('Child 1'));
        assert.ok (checkedNames.includes ('Child 2'));
    });

    it ('ExpandAll', function () {
        let root = new TreeViewGroupItem ('Root');
        let group1 = new TreeViewGroupItem ('Group 1');
        let group2 = new TreeViewGroupItem ('Group 2');
        let child1 = new TreeViewSingleItem ('Child 1');

        root.AddChild (group1);
        group1.AddChild (group2);
        group2.AddChild (child1);

        root.ExpandAll (true);
        root.ExpandAll (false);
    });

});

describe ('TreeViewSingleItem', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('Default Initialization', function () {
        let item = new TreeViewSingleItem ('Single Item');
        assert.strictEqual (item.GetName (), 'Single Item');
        assert.strictEqual (item.selected, false);
    });

    it ('SetSelected', function () {
        let item = new TreeViewSingleItem ('Single Item');
        assert.strictEqual (item.selected, false);
        item.SetSelected (true);
        assert.strictEqual (item.selected, true);
        item.SetSelected (false);
        assert.strictEqual (item.selected, false);
    });

});

describe ('TreeViewButtonItem', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('Default Initialization', function () {
        let item = new TreeViewButtonItem ('Button Item');
        assert.strictEqual (item.GetName (), 'Button Item');
        assert.ok (item.buttonsDiv !== null);
    });

});

describe ('TreeViewGroupButtonItem', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('Default Initialization', function () {
        let item = new TreeViewGroupButtonItem ('Group Button Item');
        assert.strictEqual (item.GetName (), 'Group Button Item');
        assert.ok (item.buttonsDiv !== null);
    });

});

}
