import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;
let toggleWireMode = false;

window.toggleWireframe = function (click) {
	toggleWireMode = click;
};

var heightScale = 1.0;
var projectionMode = "perspective";
var camera = {
	distance: 5.0, // Zoom
	yRotate: 0.0, // Rotate y axis
	zRotate: 0.0, // Rotate z axis
	xPanning: 0.0, // Pan left/right
	yPanning: 0.0, // Pan up/down
};

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sh
	};
}


window.loadImageFile = function(event)
{

	var f = event.target.files && event.target.files[0];
	if (!f) return;
	
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function() 
		{
			// heightmapData is globally defined
			heightmapData = processImage(img);
			
			/*
			using the data in heightmapData, create a triangle mesh
			heightmapData.data: array holding the actual data, note that 
			this is a single dimensional array the stores 2D data in row-major order

			heightmapData.width: width of map (number of columns)
			heightmapData.height: height of the map (number of rows)
			*/
			// implemented
			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);
			const h = heightmapData.height;
			const w = heightmapData.width;
			const data = heightmapData.data;

			const positions = [];

			const zScale = 2.0 / h;
			const xScale = 2.0 / w;
			const yScale = 1.0;
			for (let z = 0; z < h - 1; z++){
				for (let x = 0; x < w - 1; x++){
					const h00 = data[z * w + x];
					const h10 = data[z * w + (x + 1)];
					const h01 = data[(z + 1) * w + x];
					const h11 = data[(z + 1) * w + (x + 1)];

					const x0 = (x - w / 2) * xScale;
					const x1 = (x + 1 - w / 2) * xScale;
					const z0 = (z - h / 2) * zScale;
					const z1 = (z + 1 - h / 2) * zScale;

					positions.push(
						x0, h00 * yScale, z0,
						x1, h10 * yScale, z0,
						x0, h01 * yScale, z1
					);

					positions.push(
						x1, h10 * yScale, z0,
						x1, h11 * yScale, z1,
						x0, h01 * yScale, z1
					);
				}
			}

			// Color Array

			const colors = [];
			for (let i = 0; i < positions.length; i += 3){
				const x = positions[i + 0];
				const y = positions[i + 1];
				const z = positions[i + 2];

				const r = (x + 1.0) * 0.5;
				const g = (y + 1.0) * 0.5;
				const b = (z + 1.0) * 0.5;

				colors.push(r, g, b);

			}

			// Color Array

			const vertices = new Float32Array(positions);
			const verticesColor = new Float32Array(colors);
			vertexCount = vertices.length / 3;

			const bufferPos = createBuffer(gl, gl.ARRAY_BUFFER, vertices);
			const bufferCol = createBuffer(gl, gl.ARRAY_BUFFER, verticesColor);

			const attributeLocPos = gl.getAttribLocation(program, "position");
			const attributeLocCol = gl.getAttribLocation(program, "color");

			vao = createVAO(gl, attributeLocPos, bufferPos, attributeLocCol, bufferCol, null, null);

			// "implemented"
			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);

		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}

function draw()
{

	var fovRadians = 70 * Math.PI / 180;
	var aspectRatio = +gl.canvas.width / +gl.canvas.height;
	var nearClip = 0.001;
	var farClip = 20.0;

	var projectionMatrix;
	if (projectionMode == "perspective"){
		projectionMatrix = perspectiveMatrix(
			fovRadians, 
			aspectRatio, 
			nearClip, 
			farClip
		);
	} else {
		projectionMatrix = orthographicMatrix(
			-2.0*aspectRatio, 
			2.0*aspectRatio, 
			-2.0, 
			2.0, 
			nearClip, 
			farClip
		);
	}

	const yCos = Math.cos(camera.yRotate);
	const ySin = Math.sin(camera.yRotate);
	const zCos = Math.cos(camera.zRotate);
	const zSin = Math.sin(camera.zRotate);
	const xEye = camera.xPanning + camera.distance * ySin * zCos;
	const yEye = camera.yPanning + camera.distance * zSin;
	const zEye = camera.distance * yCos * zCos;
    var eye = [xEye, yEye, zEye];
	var target = [camera.xPanning, camera.yPanning, 0];

	var viewMatrix = setupViewMatrix(eye, target);

	var modelMatrix = identityMatrix();

	// set up transformations to the model

	var yRotation = rotateYMatrix(camera.yRotate);
	var zRotation = rotateZMatrix(camera.zRotate);
	modelMatrix = multiplyMatrices(zRotation, modelMatrix);
	modelMatrix = multiplyMatrices(yRotation, modelMatrix);

	var scaleMatrixY = [
		1,0,0,0,
		0,heightScale,0,0,
		0,0,1,0,
		0,0,0,1
	];
	modelMatrix = multiplyMatrices(scaleMatrixY, modelMatrix);

	// setup viewing matrix
	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);


	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);
	
	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

	gl.bindVertexArray(vao);
	
	let primitiveType;
	if (toggleWireMode) {
		primitiveType = gl.LINE_STRIP;
	} else {
		primitiveType = gl.TRIANGLES;
	}

	gl.drawArrays(primitiveType, 0, vertexCount);

	requestAnimationFrame(draw);

}

function createBox()
{
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i=1; i<=3; i++) 
	{
		var yAngle = i* (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll
		const zooming = 0.1;

		if (e.deltaY < 0) 
		{
			console.log("Scrolled up");
			camera.distance -= zooming;
			// e.g., zoom in
		} else {
			console.log("Scrolled down");
			camera.distance += zooming;
			// e.g., zoom out
		}
		camera.distance = Math.max(1.0, Math.min(camera.distance, 20.0));

	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;
		console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		// implement dragging logic
		// Implemented
		startX = currentX;
		startY = currentY;

		if (leftMouse){
			if (e.shiftKey){
				// Panning
				camera.xPanning += deltaX * 0.01;
				camera.yPanning -= deltaY * 0.01;
			} else {
				// Rotate
				camera.yRotate += deltaX * 0.01;
				camera.zRotate += deltaY * 0.01;
			}
		} else {
			camera.distance += deltaY * 0.01;
			camera.distance = Math.max(1.0, Math.min(20.0, camera.distance));
		}

		// Implemented
	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function initialize() 
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);
	document.getElementById("projectionSelect").addEventListener("change", e => {
		projectionMode = e.target.value;
	});
	document.getElementById("height").addEventListener("input", e => {
		heightScale = e.target.value / 50.0;
	});


	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	console.log(box);

	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

window.onload = initialize();