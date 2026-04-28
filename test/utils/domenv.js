import { JSDOM } from 'jsdom';

export function SetupDOMEnvironment ()
{
    const dom = new JSDOM ('<!DOCTYPE html><html><body></body></html>', {
        pretendToBeVisual: true,
        url: 'http://localhost/'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.Element = dom.window.Element;
    global.HTMLElement = dom.window.HTMLElement;
    global.MouseEvent = dom.window.MouseEvent;
    global.KeyboardEvent = dom.window.KeyboardEvent;
    global.Event = dom.window.Event;
    global.CustomEvent = dom.window.CustomEvent;
    global.getComputedStyle = dom.window.getComputedStyle;
    global.DOMParser = dom.window.DOMParser;
    global.Range = dom.window.Range;
    global.Selection = dom.window.Selection;

    if (!global.window.getSelection) {
        Object.defineProperty (global.window, 'getSelection', {
            value: () => {
                return {
                    removeAllRanges: () => {},
                    addRange: () => {}
                };
            }
        });
    }

    if (!global.document.createRange) {
        Object.defineProperty (global.document, 'createRange', {
            value: () => {
                return {
                    selectNodeContents: () => {}
                };
            }
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
