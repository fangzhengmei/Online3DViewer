import * as assert from 'assert';
import * as OV from '../../source/engine/main.js';
import { GetArrayBufferFileContent } from '../utils/testutils.js';

export default function suite ()
{

describe ('IO Test', function () {
    it ('Binary Reader', function () {
        let buffer = GetArrayBufferFileContent ('bin/binary_content.bin');
        let reader = new OV.BinaryReader (buffer, true);

        assert.strictEqual (reader.GetByteLength (), 166);
        assert.strictEqual (reader.ReadBoolean8 (), true);
        assert.strictEqual (reader.ReadBoolean8 (), false);

        assert.strictEqual (String.fromCharCode (reader.ReadCharacter8 ()), 'a');
        assert.strictEqual (String.fromCharCode (reader.ReadCharacter8 ()), 'A');
        assert.strictEqual (String.fromCharCode (reader.ReadUnsignedCharacter8 ()), 'a');
        assert.strictEqual (String.fromCharCode (reader.ReadUnsignedCharacter8 ()), 'A');

        assert.strictEqual (reader.ReadInteger16 (), 42);
        assert.strictEqual (reader.ReadInteger16 (), -42);
        assert.strictEqual (reader.ReadInteger16 (), 32000);
        assert.strictEqual (reader.ReadInteger16 (), -32000);

        assert.strictEqual (reader.ReadUnsignedInteger16 (), 42);
        assert.strictEqual (reader.ReadUnsignedInteger16 (), 65494);
        assert.strictEqual (reader.ReadUnsignedInteger16 (), 32000);
        assert.strictEqual (reader.ReadUnsignedInteger16 (), 33536);

        assert.strictEqual (reader.ReadInteger32 (), 42);
        assert.strictEqual (reader.ReadInteger32 (), -42);
        assert.strictEqual (reader.ReadInteger32 (), 32000);
        assert.strictEqual (reader.ReadInteger32 (), -32000);
        assert.strictEqual (reader.ReadInteger32 (), 2000000000);
        assert.strictEqual (reader.ReadInteger32 (), -2000000000);

        assert.strictEqual (reader.ReadUnsignedInteger32 (), 42);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 4294967254);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 32000);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 4294935296);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 2000000000);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 2294967296);

        assert.strictEqual (reader.ReadInteger32 (), 42);
        assert.strictEqual (reader.ReadInteger32 (), -42);
        assert.strictEqual (reader.ReadInteger32 (), 32000);
        assert.strictEqual (reader.ReadInteger32 (), -32000);
        assert.strictEqual (reader.ReadInteger32 (), 2000000000);
        assert.strictEqual (reader.ReadInteger32 (), -2000000000);

        assert.strictEqual (reader.ReadUnsignedInteger32 (), 42);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 4294967254);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 32000);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 4294935296);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 2000000000);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 2294967296);

        assert.strictEqual (reader.ReadFloat32 (), 42.0);
        assert.strictEqual (reader.ReadFloat32 (), -42.0);
        assert.strictEqual (reader.ReadFloat32 (), 12345.6787109375);
        assert.strictEqual (reader.ReadFloat32 (), -12345.6787109375);

        assert.strictEqual (reader.ReadDouble64 (), 42.0);
        assert.strictEqual (reader.ReadDouble64 (), -42.0);
        assert.strictEqual (reader.ReadDouble64 (), 12345.6789);
        assert.strictEqual (reader.ReadDouble64 (), -12345.6789);
    });

    it ('Binary Writer', function () {
        let writer = new OV.BinaryWriter (27, true);
        writer.WriteBoolean8 (true);
        writer.WriteCharacter8 (1);
        writer.WriteUnsignedCharacter8 (2);
        writer.WriteInteger16 (3);
        writer.WriteUnsignedInteger16 (4);
        writer.WriteInteger32 (5);
        writer.WriteUnsignedInteger32 (6);
        writer.WriteFloat32 (7.5);
        writer.WriteDouble64 (8.5);
        assert.ok (writer.End ());

        let reader = new OV.BinaryReader (writer.GetBuffer (), true);
        assert.strictEqual (reader.GetByteLength (), 27);
        assert.strictEqual (reader.ReadBoolean8 (), true);
        assert.strictEqual (reader.ReadCharacter8 (), 1);
        assert.strictEqual (reader.ReadUnsignedCharacter8 (), 2);
        assert.strictEqual (reader.ReadInteger16 (), 3);
        assert.strictEqual (reader.ReadUnsignedInteger16 (), 4);
        assert.strictEqual (reader.ReadInteger32 (), 5);
        assert.strictEqual (reader.ReadUnsignedInteger32 (), 6);
        assert.strictEqual (reader.ReadFloat32 (), 7.5);
        assert.strictEqual (reader.ReadDouble64 (), 8.5);
    });

    it ('Utf8 Conversion', function () {
        let str = 'example-\u2764-example';
        let buffer = OV.Utf8StringToArrayBuffer (str);
        assert.strictEqual (buffer.byteLength, 19);
        let str2 = OV.ArrayBufferToUtf8String (buffer);
        assert.strictEqual (str, str2);
        assert.strictEqual (str.length, str2.length);
    });

    it ('File Name', function () {
        assert.strictEqual (OV.GetFileName ('file.ext'), 'file.ext');
        assert.strictEqual (OV.GetFileName ('folder1/folder2/file.ext'), 'file.ext');
        assert.strictEqual (OV.GetFileName ('folder1\\folder2\\file.ext'), 'file.ext');
        assert.strictEqual (OV.GetFileName ('https://example.com/file.ext'), 'file.ext');
        assert.strictEqual (OV.GetFileName ('https://example.com/file.ext?param1=param2'), 'file.ext');
    });

    it ('File Extension', function () {
        assert.strictEqual (OV.GetFileExtension ('file.ext'), 'ext');
        assert.strictEqual (OV.GetFileExtension ('folder1/folder2/file.ext'), 'ext');
        assert.strictEqual (OV.GetFileExtension ('folder1\\folder2\\file.ext'), 'ext');
        assert.strictEqual (OV.GetFileExtension ('https://example.com/file.ext'), 'ext');
        assert.strictEqual (OV.GetFileExtension ('https://example.com/file.ext?param1=param2'), 'ext');
    });

    it ('GetFileExtensionFromMimeType - Standard Mapping', function () {
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/png'), 'png');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/jpeg'), 'jpg');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/jpg'), 'jpg');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/gif'), 'gif');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/webp'), 'webp');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/bmp'), 'bmp');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/svg+xml'), 'svg');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('application/pdf'), 'pdf');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('application/json'), 'json');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('text/plain'), 'txt');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('model/gltf-binary'), 'glb');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('model/gltf+json'), 'gltf');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('model/stl'), 'stl');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('model/obj'), 'obj');
    });

    it ('GetFileExtensionFromMimeType - Error Handling', function () {
        assert.strictEqual (OV.GetFileExtensionFromMimeType (null), '');
        assert.strictEqual (OV.GetFileExtensionFromMimeType (undefined), '');
        assert.strictEqual (OV.GetFileExtensionFromMimeType (''), '');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('   '), '');
        assert.strictEqual (OV.GetFileExtensionFromMimeType (123), '');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ({}), '');
    });

    it ('GetFileExtensionFromMimeType - Default Extension', function () {
        assert.strictEqual (OV.GetFileExtensionFromMimeType (null, 'png'), 'png');
        assert.strictEqual (OV.GetFileExtensionFromMimeType (undefined, 'jpg'), 'jpg');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('', 'bin'), 'bin');
    });

    it ('GetFileExtensionFromMimeType - Case Insensitive', function () {
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('IMAGE/PNG'), 'png');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('Image/Jpeg'), 'jpg');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('  image/png  '), 'png');
    });

    it ('GetFileExtensionFromMimeType - With Parameters', function () {
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/png; charset=utf-8'), 'png');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('text/html; charset=UTF-8'), 'html');
    });

    it ('GetFileExtensionFromMimeType - Unhandled MIME Types', function () {
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('application/x-custom'), 'x-custom');
        assert.strictEqual (OV.GetFileExtensionFromMimeType ('image/x-unknown'), 'x-unknown');
    });

    it ('GetMimeTypeFromExtension - Standard Mapping', function () {
        assert.strictEqual (OV.GetMimeTypeFromExtension ('png'), 'image/png');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('jpg'), 'image/jpeg');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('jpeg'), 'image/jpeg');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('gif'), 'image/gif');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('webp'), 'image/webp');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('bmp'), 'image/bmp');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('svg'), 'image/svg+xml');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('pdf'), 'application/pdf');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('json'), 'application/json');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('txt'), 'text/plain');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('html'), 'text/html');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('htm'), 'text/html');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('glb'), 'model/gltf-binary');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('gltf'), 'model/gltf+json');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('stl'), 'model/stl');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('obj'), 'model/obj');
    });

    it ('GetMimeTypeFromExtension - With Leading Dot', function () {
        assert.strictEqual (OV.GetMimeTypeFromExtension ('.png'), 'image/png');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('.jpg'), 'image/jpeg');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('  .png  '), 'image/png');
    });

    it ('GetMimeTypeFromExtension - Case Insensitive', function () {
        assert.strictEqual (OV.GetMimeTypeFromExtension ('PNG'), 'image/png');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('JPG'), 'image/jpeg');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('Png'), 'image/png');
    });

    it ('GetMimeTypeFromExtension - Error Handling', function () {
        assert.strictEqual (OV.GetMimeTypeFromExtension (null), 'application/octet-stream');
        assert.strictEqual (OV.GetMimeTypeFromExtension (undefined), 'application/octet-stream');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('') , 'application/octet-stream');
        assert.strictEqual (OV.GetMimeTypeFromExtension (123), 'application/octet-stream');
    });

    it ('GetMimeTypeFromExtension - Custom Default', function () {
        assert.strictEqual (OV.GetMimeTypeFromExtension (null, 'text/plain'), 'text/plain');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('unknown', 'image/png'), 'image/png');
    });

    it ('GetMimeTypeFromExtension - Unhandled Extensions', function () {
        assert.strictEqual (OV.GetMimeTypeFromExtension ('xyz'), 'application/octet-stream');
        assert.strictEqual (OV.GetMimeTypeFromExtension ('custom'), 'application/octet-stream');
    });

    it ('IsImageMimeType - Valid Image Types', function () {
        assert.strictEqual (OV.IsImageMimeType ('image/png'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/jpeg'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/jpg'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/gif'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/webp'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/bmp'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/svg+xml'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/tiff'), true);
        assert.strictEqual (OV.IsImageMimeType ('image/x-icon'), true);
    });

    it ('IsImageMimeType - Case Insensitive', function () {
        assert.strictEqual (OV.IsImageMimeType ('IMAGE/PNG'), true);
        assert.strictEqual (OV.IsImageMimeType ('Image/Jpeg'), true);
        assert.strictEqual (OV.IsImageMimeType ('  image/png  '), true);
    });

    it ('IsImageMimeType - Non-Image Types', function () {
        assert.strictEqual (OV.IsImageMimeType ('application/pdf'), false);
        assert.strictEqual (OV.IsImageMimeType ('text/plain'), false);
        assert.strictEqual (OV.IsImageMimeType ('model/stl'), false);
        assert.strictEqual (OV.IsImageMimeType ('application/json'), false);
        assert.strictEqual (OV.IsImageMimeType ('video/mp4'), false);
        assert.strictEqual (OV.IsImageMimeType ('audio/mpeg'), false);
    });

    it ('IsImageMimeType - Error Handling', function () {
        assert.strictEqual (OV.IsImageMimeType (null), false);
        assert.strictEqual (OV.IsImageMimeType (undefined), false);
        assert.strictEqual (OV.IsImageMimeType (''), false);
        assert.strictEqual (OV.IsImageMimeType (123), false);
        assert.strictEqual (OV.IsImageMimeType ({}), false);
    });

    it ('Base64DataURIToArrayBuffer - PNG', function () {
        let pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        let result = OV.Base64DataURIToArrayBuffer (pngDataUrl);
        assert.notStrictEqual (result, null);
        assert.strictEqual (result.mimeType, 'image/png');
        assert.ok (result.buffer instanceof ArrayBuffer);
        assert.ok (result.buffer.byteLength > 0);
    });

    it ('Base64DataURIToArrayBuffer - JPEG', function () {
        let jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwDfAP/2Q==';
        let result = OV.Base64DataURIToArrayBuffer (jpegDataUrl);
        assert.notStrictEqual (result, null);
        assert.strictEqual (result.mimeType, 'image/jpeg');
        assert.ok (result.buffer instanceof ArrayBuffer);
        assert.ok (result.buffer.byteLength > 0);
    });

    it ('Base64DataURIToArrayBuffer - Invalid URLs', function () {
        assert.strictEqual (OV.Base64DataURIToArrayBuffer ('invalid'), null);
        assert.strictEqual (OV.Base64DataURIToArrayBuffer ('data:no-semicolon'), null);
        assert.strictEqual (OV.Base64DataURIToArrayBuffer ('data:image/png;no-comma'), null);
    });
});

}
