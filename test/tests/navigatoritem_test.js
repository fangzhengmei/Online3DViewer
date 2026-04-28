import * as assert from 'assert';
import { SetupDOMEnvironment, CleanupDOMEnvironment, SimulateClick, SimulateDblClick, SimulateKeyPress } from '../utils/domenv.js';

export default function suite ()
{

describe ('Navigator Item Visibility', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('NavigatorItemRecurse constants are defined', async function () {
        const { NavigatorItemRecurse } = await import ('../../source/website/navigatoritems.js');
        assert.strictEqual (NavigatorItemRecurse.No, 0);
        assert.strictEqual (NavigatorItemRecurse.Parents, 1);
        assert.strictEqual (NavigatorItemRecurse.Children, 2);
        assert.strictEqual (NavigatorItemRecurse.All, 3);
    });

});

describe ('TreeView Item Rename Logic', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('TreeViewItem has editable option', async function () {
        const { TreeViewItem } = await import ('../../source/website/treeview.js');
        let item = new TreeViewItem ('Original Name', null, { editable: true });
        assert.strictEqual (item.editable, true);
        assert.strictEqual (item.GetName (), 'Original Name');
    });

    it ('TreeViewItem name can be changed via SetName', async function () {
        const { TreeViewItem } = await import ('../../source/website/treeview.js');
        let item = new TreeViewItem ('Old Name');
        assert.strictEqual (item.GetName (), 'Old Name');
        item.SetName ('New Name');
        assert.strictEqual (item.GetName (), 'New Name');
    });

    it ('TreeViewItem OnNameChange callback', async function () {
        const { TreeViewItem } = await import ('../../source/website/treeview.js');
        let item = new TreeViewItem ('Original Name', null, { editable: true });
        let callbackCalled = false;
        let receivedNewName = null;
        let receivedOldName = null;

        item.OnNameChange ((newName, oldName) => {
            callbackCalled = true;
            receivedNewName = newName;
            receivedOldName = oldName;
        });

        item.SetName ('Changed Name');
        assert.strictEqual (callbackCalled, false);
    });

});

describe ('TreeView Checkbox Integration', function () {

    beforeEach (function () {
        SetupDOMEnvironment ();
    });

    afterEach (function () {
        CleanupDOMEnvironment ();
    });

    it ('TreeViewSingleItem with checkbox option', async function () {
        const { TreeViewSingleItem } = await import ('../../source/website/treeview.js');
        let item = new TreeViewSingleItem ('Test Item', null, { hasCheckbox: true });
        assert.ok (item.checkbox !== null);
        assert.strictEqual (item.IsChecked (), false);
        item.SetChecked (true);
        assert.strictEqual (item.IsChecked (), true);
    });

    it ('TreeViewGroupItem checkbox recursive operations', async function () {
        const { TreeViewGroupItem, TreeViewSingleItem } = await import ('../../source/website/treeview.js');

        let root = new TreeViewGroupItem ('Root', null, { hasCheckbox: true });
        let groupA = new TreeViewGroupItem ('Group A', null, { hasCheckbox: true });
        let item1 = new TreeViewSingleItem ('Item 1', null, { hasCheckbox: true });
        let item2 = new TreeViewSingleItem ('Item 2', null, { hasCheckbox: true });

        root.AddChild (groupA);
        groupA.AddChild (item1);
        groupA.AddChild (item2);

        assert.strictEqual (root.GetCheckedChildCount (), 0);
        assert.strictEqual (root.GetCheckedItems ().length, 0);

        item1.SetChecked (true);
        assert.strictEqual (root.GetCheckedChildCount (), 1);

        root.SetCheckedRecursive (true);
        assert.strictEqual (root.IsChecked (), true);
        assert.strictEqual (groupA.IsChecked (), true);
        assert.strictEqual (item1.IsChecked (), true);
        assert.strictEqual (item2.IsChecked (), true);
        assert.strictEqual (root.GetCheckedChildCount (), 4);

        root.SetCheckedRecursive (false);
        assert.strictEqual (root.IsChecked (), false);
        assert.strictEqual (groupA.IsChecked (), false);
        assert.strictEqual (item1.IsChecked (), false);
        assert.strictEqual (item2.IsChecked (), false);
    });

    it ('TreeViewButtonItem with checkbox', async function () {
        const { TreeViewButtonItem } = await import ('../../source/website/treeview.js');
        let item = new TreeViewButtonItem ('Button Item', null, { hasCheckbox: true });
        assert.ok (item.checkbox !== null);
        item.SetChecked (true);
        assert.strictEqual (item.IsChecked (), true);
    });

    it ('TreeViewGroupButtonItem with checkbox', async function () {
        const { TreeViewGroupButtonItem, TreeViewSingleItem } = await import ('../../source/website/treeview.js');
        let group = new TreeViewGroupButtonItem ('Group', null, { hasCheckbox: true });
        let child = new TreeViewSingleItem ('Child', null, { hasCheckbox: true });
        group.AddChild (child);

        group.SetCheckedRecursive (true);
        assert.strictEqual (group.IsChecked (), true);
        assert.strictEqual (child.IsChecked (), true);
    });

    it ('Checkbox onChange callback propagation', async function () {
        const { TreeViewSingleItem } = await import ('../../source/website/treeview.js');

        let callbackResults = [];
        let item = new TreeViewSingleItem ('Test', null, { hasCheckbox: true });
        item.OnCheckboxChange ((checked) => {
            callbackResults.push (checked);
        });

        item.SetChecked (true);
        assert.deepStrictEqual (callbackResults, [true]);

        item.SetChecked (false);
        assert.deepStrictEqual (callbackResults, [true, false]);
    });

    it ('EnumerateChildren nested structure', async function () {
        const { TreeViewGroupItem, TreeViewSingleItem } = await import ('../../source/website/treeview.js');

        let root = new TreeViewGroupItem ('Root');
        let level1a = new TreeViewGroupItem ('Level 1A');
        let level1b = new TreeViewGroupItem ('Level 1B');
        let level2a1 = new TreeViewSingleItem ('Level 2A-1');
        let level2a2 = new TreeViewSingleItem ('Level 2A-2');
        let level2b1 = new TreeViewSingleItem ('Level 2B-1');

        root.AddChild (level1a);
        root.AddChild (level1b);
        level1a.AddChild (level2a1);
        level1a.AddChild (level2a2);
        level1b.AddChild (level2b1);

        let itemsNonRecursive = [];
        root.EnumerateChildren ((item) => {
            itemsNonRecursive.push (item.GetName ());
            return true;
        }, false);
        assert.deepStrictEqual (itemsNonRecursive, ['Level 1A', 'Level 1B']);

        let itemsRecursive = [];
        root.EnumerateChildren ((item) => {
            itemsRecursive.push (item.GetName ());
            return true;
        }, true);
        assert.deepStrictEqual (itemsRecursive, ['Level 1A', 'Level 2A-1', 'Level 2A-2', 'Level 1B', 'Level 2B-1']);
    });

    it ('GetCheckedItems returns correct items', async function () {
        const { TreeViewGroupItem, TreeViewSingleItem } = await import ('../../source/website/treeview.js');

        let root = new TreeViewGroupItem ('Root', null, { hasCheckbox: true });
        let groupA = new TreeViewGroupItem ('Group A', null, { hasCheckbox: true });
        let groupB = new TreeViewGroupItem ('Group B', null, { hasCheckbox: true });
        let item1 = new TreeViewSingleItem ('Item 1', null, { hasCheckbox: true });
        let item2 = new TreeViewSingleItem ('Item 2', null, { hasCheckbox: true });
        let item3 = new TreeViewSingleItem ('Item 3', null, { hasCheckbox: true });

        root.AddChild (groupA);
        root.AddChild (groupB);
        groupA.AddChild (item1);
        groupA.AddChild (item2);
        groupB.AddChild (item3);

        assert.strictEqual (root.GetCheckedItems ().length, 0);

        item1.SetChecked (true);
        item3.SetChecked (true);
        let checkedItems = root.GetCheckedItems ();
        let checkedNames = checkedItems.map (i => i.GetName ());

        assert.strictEqual (checkedItems.length, 2);
        assert.ok (checkedNames.includes ('Item 1'));
        assert.ok (checkedNames.includes ('Item 3'));

        groupA.SetCheckedRecursive (true);
        checkedItems = root.GetCheckedItems ();
        checkedNames = checkedItems.map (i => i.GetName ());

        assert.ok (checkedNames.includes ('Group A'));
        assert.ok (checkedNames.includes ('Item 1'));
        assert.ok (checkedNames.includes ('Item 2'));
    });

});

}
