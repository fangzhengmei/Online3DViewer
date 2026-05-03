export function ArrayBufferToUtf8String (buffer)
{
	let decoder = new TextDecoder ('utf-8');
	return decoder.decode (buffer);
}

export function ArrayBufferToAsciiString (buffer)
{
	let text = '';
	let bufferView = new Uint8Array (buffer);
	for (let i = 0; i < bufferView.byteLength; i++) {
		text += String.fromCharCode (bufferView[i]);
	}
	return text;
}

export function AsciiStringToArrayBuffer (str)
{
	let buffer = new ArrayBuffer (str.length);
	let bufferView = new Uint8Array (buffer);
	for (let i = 0; i < str.length; i++) {
		bufferView[i] = str.charCodeAt (i);
	}
	return buffer;
}

export function Utf8StringToArrayBuffer (str)
{
	let encoder = new TextEncoder ();
	let uint8Array = encoder.encode (str);
	return uint8Array.buffer;
}

export function Base64DataURIToArrayBuffer (uri)
{
	let dataPrefix = 'data:';
	if (!uri.startsWith (dataPrefix)) {
		return null;
	}

	let mimeSeparator = uri.indexOf (';');
	if (mimeSeparator === -1) {
		return null;
	}

	let bufferSeparator = uri.indexOf (',');
	if (bufferSeparator === -1) {
		return null;
	}

	let mimeType = uri.substring (dataPrefix.length, dataPrefix.length + mimeSeparator - 5);
	let base64String = atob (uri.substring (bufferSeparator + 1));
	let buffer = new ArrayBuffer (base64String.length);
	let bufferView = new Uint8Array (buffer);
	for (let i = 0; i < base64String.length; i++) {
		bufferView[i] = base64String.charCodeAt (i);
	}

	return {
		mimeType : mimeType,
		buffer : buffer
	};
}

const MimeTypeToExtensionMap = {
	'image/png' : 'png',
	'image/jpeg' : 'jpg',
	'image/jpg' : 'jpg',
	'image/gif' : 'gif',
	'image/bmp' : 'bmp',
	'image/webp' : 'webp',
	'image/svg+xml' : 'svg',
	'image/tiff' : 'tiff',
	'image/x-icon' : 'ico',
	'application/pdf' : 'pdf',
	'application/json' : 'json',
	'text/plain' : 'txt',
	'text/html' : 'html',
	'text/css' : 'css',
	'text/javascript' : 'js',
	'application/xml' : 'xml',
	'text/xml' : 'xml',
	'application/zip' : 'zip',
	'application/gzip' : 'gz',
	'application/x-rar-compressed' : 'rar',
	'application/x-7z-compressed' : '7z',
	'audio/mpeg' : 'mp3',
	'audio/wav' : 'wav',
	'audio/ogg' : 'ogg',
	'video/mp4' : 'mp4',
	'video/webm' : 'webm',
	'video/ogg' : 'ogg',
	'application/octet-stream' : 'bin',
	'model/gltf-binary' : 'glb',
	'model/gltf+json' : 'gltf',
	'model/obj' : 'obj',
	'model/stl' : 'stl',
	'model/3mf' : '3mf',
	'model/vnd.usdz+zip' : 'usdz'
};

const ExtensionToMimeTypeMap = {
	'png' : 'image/png',
	'jpg' : 'image/jpeg',
	'jpeg' : 'image/jpeg',
	'gif' : 'image/gif',
	'bmp' : 'image/bmp',
	'webp' : 'image/webp',
	'svg' : 'image/svg+xml',
	'tiff' : 'image/tiff',
	'ico' : 'image/x-icon',
	'pdf' : 'application/pdf',
	'json' : 'application/json',
	'txt' : 'text/plain',
	'html' : 'text/html',
	'htm' : 'text/html',
	'css' : 'text/css',
	'js' : 'text/javascript',
	'xml' : 'application/xml',
	'zip' : 'application/zip',
	'gz' : 'application/gzip',
	'rar' : 'application/x-rar-compressed',
	'7z' : 'application/x-7z-compressed',
	'mp3' : 'audio/mpeg',
	'wav' : 'audio/wav',
	'ogg' : 'audio/ogg',
	'mp4' : 'video/mp4',
	'webm' : 'video/webm',
	'bin' : 'application/octet-stream',
	'glb' : 'model/gltf-binary',
	'gltf' : 'model/gltf+json',
	'obj' : 'model/obj',
	'stl' : 'model/stl',
	'3mf' : 'model/3mf',
	'usdz' : 'model/vnd.usdz+zip'
};

const ImageMimeTypes = new Set ([
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif',
	'image/bmp',
	'image/webp',
	'image/svg+xml',
	'image/tiff',
	'image/x-icon'
]);

export function IsImageMimeType (mimeType)
{
	if (mimeType === undefined || mimeType === null || typeof mimeType !== 'string') {
		return false;
	}
	return ImageMimeTypes.has (mimeType.toLowerCase ());
}

export function GetFileExtensionFromMimeType (mimeType, defaultExtension = '')
{
	if (mimeType === undefined || mimeType === null || typeof mimeType !== 'string') {
		return defaultExtension;
	}
	let normalizedMimeType = mimeType.toLowerCase ().trim ();
	if (normalizedMimeType.length === 0) {
		return defaultExtension;
	}
	let mappedExtension = MimeTypeToExtensionMap[normalizedMimeType];
	if (mappedExtension !== undefined) {
		return mappedExtension;
	}
	let mimeParts = normalizedMimeType.split ('/');
	if (mimeParts.length >= 2 && mimeParts[1].length > 0) {
		let secondPart = mimeParts[1];
		let paramIndex = secondPart.indexOf (';');
		if (paramIndex > 0) {
			secondPart = secondPart.substring (0, paramIndex).trim ();
		}
		if (secondPart.length > 0) {
			return secondPart;
		}
	}
	return defaultExtension;
}

export function GetMimeTypeFromExtension (extension, defaultMimeType = 'application/octet-stream')
{
	if (extension === undefined || extension === null || typeof extension !== 'string') {
		return defaultMimeType;
	}
	let normalizedExtension = extension.toLowerCase ().trim ();
	if (normalizedExtension.startsWith ('.')) {
		normalizedExtension = normalizedExtension.substring (1);
	}
	if (normalizedExtension.length === 0) {
		return defaultMimeType;
	}
	let mappedMimeType = ExtensionToMimeTypeMap[normalizedExtension];
	if (mappedMimeType !== undefined) {
		return mappedMimeType;
	}
	return defaultMimeType;
}

export function CreateObjectUrl (content)
{
	let blob = new Blob ([content]);
	let url = URL.createObjectURL (blob);
	return url;
}

export function CreateObjectUrlWithMimeType (content, mimeType)
{
	let blob = new Blob ([content], { type : mimeType });
	let url = URL.createObjectURL (blob);
	return url;
}

export function RevokeObjectUrl (url)
{
	URL.revokeObjectURL (url);
}
