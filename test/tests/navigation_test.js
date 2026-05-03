import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';

function CreateMockNavigation ()
{
    let orbitCalls = 0;
    let panCalls = 0;
    let zoomCalls = 0;
    let panZoomCalls = 0;

    return {
        ExecuteOrbit: function (eventData) {
            orbitCalls++;
        },
        ExecutePan: function (eventData) {
            panCalls++;
        },
        ExecuteZoom: function (eventData) {
            zoomCalls++;
        },
        ExecutePanZoom: function (eventData) {
            panZoomCalls++;
        },
        GetOrbitCalls: function () { return orbitCalls; },
        GetPanCalls: function () { return panCalls; },
        GetZoomCalls: function () { return zoomCalls; },
        GetPanZoomCalls: function () { return panZoomCalls; },
        ResetCalls: function () {
            orbitCalls = 0;
            panCalls = 0;
            zoomCalls = 0;
            panZoomCalls = 0;
        }
    };
}

export default function suite ()
{

describe ('Navigation State Machine', function () {

    describe ('Initial State', function () {
        it ('Should start in Idle state', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);
            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });
    });

    describe ('Mouse Interaction - State Transitions', function () {
        it ('Left mouse button without modifiers should transition to Orbit', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: false,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Orbit);
        });

        it ('Left mouse button with Ctrl should transition to Zoom', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: true,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Zoom);
        });

        it ('Left mouse button with Shift should transition to Pan', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: false,
                shiftKey: true
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Pan);
        });

        it ('Right mouse button should transition to Pan', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 2,
                ctrlKey: false,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Pan);
        });

        it ('Middle mouse button should transition to Pan', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 3,
                ctrlKey: false,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Pan);
        });
    });

    describe ('Mouse Interaction - Action Execution', function () {
        it ('Orbit state should call ExecuteOrbit on MouseMove', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: false,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Orbit);
            assert.strictEqual (mockNav.GetOrbitCalls (), 0);

            stateMachine.Transition (OV.NavigationEvent.MouseMove, {
                moveDiff: { x: 10, y: 5 }
            });

            assert.strictEqual (mockNav.GetOrbitCalls (), 1);
        });

        it ('Pan state should call ExecutePan on MouseMove', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: false,
                shiftKey: true
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Pan);
            assert.strictEqual (mockNav.GetPanCalls (), 0);

            stateMachine.Transition (OV.NavigationEvent.MouseMove, {
                moveDiff: { x: 10, y: 5 }
            });

            assert.strictEqual (mockNav.GetPanCalls (), 1);
        });

        it ('Zoom state should call ExecuteZoom on MouseMove', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: true,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Zoom);
            assert.strictEqual (mockNav.GetZoomCalls (), 0);

            stateMachine.Transition (OV.NavigationEvent.MouseMove, {
                moveDiff: { x: 0, y: 10 }
            });

            assert.strictEqual (mockNav.GetZoomCalls (), 1);
        });
    });

    describe ('Touch Interaction - State Transitions', function () {
        it ('Single finger touch should transition to Orbit', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.TouchStart, {
                fingerCount: 1
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Orbit);
        });

        it ('Two finger touch should transition to PanZoom', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.TouchStart, {
                fingerCount: 2
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.PanZoom);
        });
    });

    describe ('Touch Interaction - Action Execution', function () {
        it ('Orbit state should call ExecuteOrbit on TouchMove', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.TouchStart, {
                fingerCount: 1
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Orbit);
            assert.strictEqual (mockNav.GetOrbitCalls (), 0);

            stateMachine.Transition (OV.NavigationEvent.TouchMove, {
                moveDiff: { x: 10, y: 5 },
                distanceDiff: 0,
                fingerCount: 1
            });

            assert.strictEqual (mockNav.GetOrbitCalls (), 1);
        });

        it ('PanZoom state should call ExecutePanZoom on TouchMove', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.TouchStart, {
                fingerCount: 2
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.PanZoom);
            assert.strictEqual (mockNav.GetPanZoomCalls (), 0);

            stateMachine.Transition (OV.NavigationEvent.TouchMove, {
                moveDiff: { x: 10, y: 5 },
                distanceDiff: 20,
                fingerCount: 2
            });

            assert.strictEqual (mockNav.GetPanZoomCalls (), 1);
        });
    });

    describe ('Wheel Zoom', function () {
        it ('Wheel event should call ExecuteZoom and return to Idle', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
            assert.strictEqual (mockNav.GetZoomCalls (), 0);

            stateMachine.Transition (OV.NavigationEvent.Wheel, {
                ratio: 0.1
            });

            assert.strictEqual (mockNav.GetZoomCalls (), 1);
            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });
    });

    describe ('Return to Idle After Interaction', function () {
        it ('MouseUp should return to Idle from Orbit', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: false,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Orbit);

            stateMachine.Transition (OV.NavigationEvent.MouseUp);

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });

        it ('MouseUp should return to Idle from Pan', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 2,
                ctrlKey: false,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Pan);

            stateMachine.Transition (OV.NavigationEvent.MouseUp);

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });

        it ('MouseUp should return to Idle from Zoom', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: true,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Zoom);

            stateMachine.Transition (OV.NavigationEvent.MouseUp);

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });

        it ('MouseLeave should return to Idle', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.MouseDown, {
                mouseButton: 1,
                ctrlKey: false,
                shiftKey: false
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Orbit);

            stateMachine.Transition (OV.NavigationEvent.MouseLeave);

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });

        it ('TouchEnd should return to Idle from Orbit', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.TouchStart, {
                fingerCount: 1
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Orbit);

            stateMachine.Transition (OV.NavigationEvent.TouchEnd);

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });

        it ('TouchEnd should return to Idle from PanZoom', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            stateMachine.Transition (OV.NavigationEvent.TouchStart, {
                fingerCount: 2
            });

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.PanZoom);

            stateMachine.Transition (OV.NavigationEvent.TouchEnd);

            assert.strictEqual (stateMachine.GetCurrentState (), OV.NavigationState.Idle);
        });
    });

    describe ('NavigationType from State', function () {
        it ('Should get correct NavigationType from state', function () {
            let mockNav = CreateMockNavigation ();
            let stateMachine = new OV.NavigationStateMachine (mockNav);

            assert.strictEqual (
                stateMachine.GetNavigationTypeFromState (OV.NavigationState.Idle),
                OV.NavigationType.None
            );
            assert.strictEqual (
                stateMachine.GetNavigationTypeFromState (OV.NavigationState.Orbit),
                OV.NavigationType.Orbit
            );
            assert.strictEqual (
                stateMachine.GetNavigationTypeFromState (OV.NavigationState.Pan),
                OV.NavigationType.Pan
            );
            assert.strictEqual (
                stateMachine.GetNavigationTypeFromState (OV.NavigationState.PanZoom),
                OV.NavigationType.Pan
            );
            assert.strictEqual (
                stateMachine.GetNavigationTypeFromState (OV.NavigationState.Zoom),
                OV.NavigationType.Zoom
            );
        });
    });

});

}
