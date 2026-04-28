import { JSDOM } from 'jsdom';

export function SetupDOMEnvironment ()
{
    const dom = new JSDOM ('<!DOCTYPE html><html><body></body></html>', {
        pretendToBeVisual: true,
        url: 'http://localhost/'
    });

    global.window = dom.window;
    global.document = dom.window.document;

    Object.defineProperty (global, 'navigator', {
        value: dom.window.navigator,
        configurable: true,
        writable: true
    });

    Object.defineProperty (global, 'Element', {
        value: dom.window.Element,
        configurable: true
    });

    Object.defineProperty (global, 'HTMLElement', {
        value: dom.window.HTMLElement,
        configurable: true
    });

    Object.defineProperty (global, 'MouseEvent', {
        value: dom.window.MouseEvent,
        configurable: true
    });

    Object.defineProperty (global, 'KeyboardEvent', {
        value: dom.window.KeyboardEvent,
        configurable: true
    });

    Object.defineProperty (global, 'Event', {
        value: dom.window.Event,
        configurable: true
    });

    Object.defineProperty (global, 'CustomEvent', {
        value: dom.window.CustomEvent,
        configurable: true
    });

    Object.defineProperty (global, 'getComputedStyle', {
        value: dom.window.getComputedStyle,
        configurable: true
    });

    Object.defineProperty (global, 'DOMParser', {
        value: dom.window.DOMParser,
        configurable: true
    });

    Object.defineProperty (global, 'Range', {
        value: dom.window.Range,
        configurable: true
    });

    Object.defineProperty (global, 'Selection', {
        value: dom.window.Selection,
        configurable: true
    });

    if (!dom.window.Element.prototype.scrollIntoView) {
        Object.defineProperty (dom.window.Element.prototype, 'scrollIntoView', {
            value: function (options) {
                return;
            },
            configurable: true,
            writable: true
        });
    }

    if (!global.window.getSelection) {
        Object.defineProperty (global.window, 'getSelection', {
            value: () => {
                return {
                    removeAllRanges: () => {},
                    addRange: () => {}
                };
            },
            configurable: true
        });
    }

    if (!global.document.createRange) {
        Object.defineProperty (global.document, 'createRange', {
            value: () => {
                return {
                    selectNodeContents: () => {}
                };
            },
            configurable: true
        });
    }

    return dom;
}

export function CleanupDOMEnvironment ()
{
    if (global.window) {
        global.window.close ();
    }
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.Element;
    delete global.HTMLElement;
    delete global.MouseEvent;
    delete global.KeyboardEvent;
    delete global.Event;
    delete global.CustomEvent;
    delete global.getComputedStyle;
}

export function SimulateClick (element)
{
    const event = new MouseEvent ('click', {
        bubbles: true,
        cancelable: true,
        view: global.window
    });
    element.dispatchEvent (event);
}

export function SimulateDblClick (element)
{
    const event = new MouseEvent ('dblclick', {
        bubbles: true,
        cancelable: true,
        view: global.window
    });
    element.dispatchEvent (event);
}

export function SimulateKeyPress (element, key)
{
    const event = new KeyboardEvent ('keydown', {
        key: key,
        bubbles: true,
        cancelable: true
    });
    element.dispatchEvent (event);
}
