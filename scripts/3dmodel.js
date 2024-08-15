import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import * as HighLight from '/scripts/highlightOffices.js';

import * as NodesJson from '/static/files/Nodes.json';
var Nodes = NodesJson['nodes'];

const sleep = (delay, ret="") => new Promise((resolve) => setTimeout(() => {resolve(ret)}, delay));

var Offices = [];
var graph;

var firstFloorRooms = [];
var secondFloorRooms = [];

var modelFrom;
var modelTo;

var sameFloor = true;

window.myFocus = 'building';  // 'floor1', 'floor2'
window.options = {
    'fire': false,
    'phone': false,
    'boxes': false,
    'nav': false
}
window.boxes1;
window.boxes2;

var controls, loader;

var models = {};
var modelPath;
var Arrows = [];
var arrowTipScale = 0.9;

const centerXOffset = -2.13;
const centerZOffset = -3.95;
var prevTarget = 'building';

let pathShowed = false;

/* -------------------- GRAPH --------------------*/

// office
class Office {
    constructor(name, position, connectedOffices = []) {
        this.name = name;
        this.position = position;
        this.connectedOffices = connectedOffices;
    }
}

function distanceBetweenOffices(office1, office2) {
    return Math.sqrt(
        Math.pow(office2.position[0] - office1.position[0], 2) + 
        Math.pow(office2.position[1] - office1.position[1], 2) + 
        Math.pow(office2.position[2] - office1.position[2], 2)
    )
}

function officeByName(officeName) {
    return Offices.find((element) => officeName == element.name);
}

// graph
class Graph {
    constructor() {
        this.vertices = {};
    }

    addVertex(vertex) {
        if (!this.vertices[vertex]) {
            this.vertices[vertex] = [];
        }
    }

    addEdge(vertex1, vertex2, weight) {
        this.vertices[vertex1].push({ vertex: vertex2, weight: weight });
        this.vertices[vertex2].push({ vertex: vertex1, weight: weight });
    }

    dijkstra(startVertex, endVertex) {
        const distances = {};
        const previous = {};
        const priorityQueue = new PriorityQueue();

        for (let vertex in this.vertices) {
            if (vertex === startVertex) {
                distances[vertex] = 0;
                priorityQueue.enqueue(vertex, 0);
            } else {
                distances[vertex] = Infinity;
                priorityQueue.enqueue(vertex, Infinity);
            }
            previous[vertex] = null;
        }

        while (!priorityQueue.isEmpty()) {
            const currentVertex = priorityQueue.dequeue().element;

            if (currentVertex === endVertex) {
                const path = [];
                let temp = endVertex;
                while (temp !== null) {
                    path.unshift(temp);
                    temp = previous[temp];
                }
                return { path, distance: distances[endVertex] };
            }

            if (currentVertex || distances[currentVertex] !== Infinity) {
                for (let neighbor of this.vertices[currentVertex]) {
                    const candidateDistance = distances[currentVertex] + neighbor.weight;
                    if (candidateDistance < distances[neighbor.vertex]) {
                        distances[neighbor.vertex] = candidateDistance;
                        previous[neighbor.vertex] = currentVertex;
                        priorityQueue.enqueue(neighbor.vertex, candidateDistance);
                    }
                }
            }
        }

        return null;
    }
}

class PriorityQueue {
    constructor() {
        this.items = [];
    }

    enqueue(element, priority) {
        const queueElement = { element, priority };
        let added = false;
        for (let i = 0; i < this.items.length; i++) {
            if (queueElement.priority < this.items[i].priority) {
                this.items.splice(i, 0, queueElement);
                added = true;
                break;
            }
        }
        if (!added) {
            this.items.push(queueElement);
        }
    }

    dequeue() {
        if (this.isEmpty()) {
            return null;
        }
        return this.items.shift();
    }

    isEmpty() {
        return this.items.length === 0;
    }
}

/* -------------------- GRAPH INIT --------------------*/

function init_graph() {
    // setup offices from json
    Nodes.forEach(node => {
        let connectedOffices = [];
        if ('extras' in node) {
            connectedOffices.push(node['extras']['connectTo']['name']);
        }
        Offices.push(new Office(node['name'], node['translation'], connectedOffices));
    });

    // adding vertesis and edges
    graph = new Graph();
    Offices.forEach(office => {
        graph.addVertex(office.name);
    });
    Offices.forEach(office1 => {
        office1.connectedOffices.forEach(office2name => {
            let office2 = Offices.find((element) => element.name == office2name);
            graph.addEdge(office1.name, office2.name, distanceBetweenOffices(office1, office2));
        });
    });
}

/* -------------------- FIND PATH --------------------*/

// find path
function findPath(nodeName) {
    let result1 = graph.dijkstra(nodeName, "ВИХІД");
    let result2 = graph.dijkstra(nodeName, "ВИХІД 2");
    if (result1['distance'] > result2['distance']) {
        result1 = result2;
    }
    let path = result1['path'];
    let dist = result1['distance'];
    console.log("Найкоротший шлях до ВИХОДУ:");
    console.log(result1);
    drawPath(path, dist);
}

function findPathToOffice(nodeName, two) {
    let result1 = graph.dijkstra(nodeName, two);
    let path = result1['path'];
    let dist = result1['distance'];
    console.log("Найкоротший шлях до КАБІНЕТУ:");
    console.log(result1);
    drawPath(path, dist);
}

// -------------------- MODEL FUNCTIONS -------------------- //

function gltfLoad(path, name, show, add, scale = 1) {
    loader.load(path, function (gltf) {
        let model = gltf.scene;
        model.receiveShadow = true;
        model.castShadow = true;
        model.traverse(function(object) {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
                object.material.side = THREE.DoubleSide;
                object.scale.copy(new THREE.Vector3(scale, scale, scale));
                if (name == 'boxes1' || name == 'boxes2') {
                    object.material = object.material.clone();
                }
            }
        });
        toggleModel(model, show);
        models[name] = model;
        if (name == 'boxes1') {
            window.boxes1 = model;
        }
        if (name == 'boxes2') {
            window.boxes2 = model;
        }
        if (add) {
            window.scene.add(models[name]);
        }
    });
}

function toggleModel(model, show) {
    if (model == undefined || model == null) {
        return;
    }
    model.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
            child.visible = show;
        }
    });
}

function setOpacity(model, opacity = 1) {
    model.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
            child.material.opacity = opacity;
            if (opacity == 1) {
                child.material.transparent = false;
            }else {
                child.material.transparent = true;
            }
        }
    });
}

function showFirstFloor(show) {
    if (show) {  // SHOW
        toggleModel(models['floor1'], true);
        toggleModel(models['building'], false);
        if (sameFloor) {
            toggleModel(models['floor2'], false);
        }

        setOpacity(models['floor1']);
        setOpacity(models['fire1']);
        setOpacity(models['phone1']);
        setOpacity(models['nav1']);
        // other
        if (window.options['fire']) {
            toggleModel(models['fire1'], true);
        }
        if (window.options['boxes']) {
            toggleModel(models['boxes1'], true);
        }
        if (window.options['phone']) {
            toggleModel(models['phone1'], true);
        }
        if (window.options['nav']) {
            toggleModel(models['nav1'], true);
        }
    } else {  // HIDE
        if (!sameFloor && pathShowed) {
            setOpacity(models['floor1'], 0.1);
            setOpacity(models['fire1'], 0.1);
            setOpacity(models['phone1'], 0.1);
            setOpacity(models['nav1'], 0.1);
            toggleModel(models['boxes1'], false);
        }else {
            toggleModel(models['floor1'], false);
            toggleModel(models['fire1'], false);
            toggleModel(models['boxes1'], false);
            toggleModel(models['phone1'], false);
            toggleModel(models['nav1'], false);
        }
        if (pathShowed) {
            toggleModel(modelFrom, true);
            toggleModel(modelTo, true);
        }
        if (window.myFocus != 'floor2') {
            toggleModel(models['building'], true);
        }
    }
}

function showSecondFloor(show) {
    if (show) {
        toggleModel(models['floor2'], true);
        toggleModel(models['building'], false);
        if (sameFloor) {
            toggleModel(models['floor1'], false);
        }
        //
        setOpacity(models['floor2']);
        setOpacity(models['fire2']);
        setOpacity(models['phone2']);
        setOpacity(models['nav2']);
        // other
        if (window.options['fire']) {
            toggleModel(models['fire2'], true);
        }
        if (window.options['boxes']) {
            toggleModel(models['boxes2'], true);
        }
        if (window.options['phone']) {
            toggleModel(models['phone2'], true);
        }
        if (window.options['nav']) {
            toggleModel(models['nav2'], true);
        }
    } else {
        if (!sameFloor && pathShowed) {
            setOpacity(models['floor2'], 0.1);
            setOpacity(models['fire2'], 0.1);
            setOpacity(models['phone2'], 0.1);
            setOpacity(models['nav2'], 0.1);
            toggleModel(models['boxes2'], false);
        }else {
            toggleModel(models['floor2'], false);
            toggleModel(models['fire2'], false);
            toggleModel(models['boxes2'], false);
            toggleModel(models['phone2'], false);
            toggleModel(models['nav2'], false);
        }
        if (pathShowed) {
            toggleModel(modelFrom, true);
            toggleModel(modelTo, true);
        }
        if (window.myFocus != 'floor1') {
            toggleModel(models['building'], true);
        }
    }
}

function showFire(show) {
    if (!show) {  // HIDE
        toggleModel(models['fire1'], false);
        toggleModel(models['fire2'], false);
        return;
    }
    // SHOW
    if (window.myFocus == 'building') {
        toggleModel(models['fire1'], true);
        toggleModel(models['fire2'], true);
    }
    if (window.myFocus == 'floor1') {
        toggleModel(models['fire1'], true);
    }
    if (window.myFocus == 'floor2') {
        toggleModel(models['fire2'], true);
    }
}

function showPhone(show) {
    if (!show) {  // HIDE
        toggleModel(models['phone1'], false);
        toggleModel(models['phone2'], false);
        return;
    }
    // SHOW
    if (window.myFocus == 'building') {
        toggleModel(models['phone1'], true);
        toggleModel(models['phone2'], true);
    }
    if (window.myFocus == 'floor1') {
        toggleModel(models['phone1'], true);
    }
    if (window.myFocus == 'floor2') {
        toggleModel(models['phone2'], true);
    }
}

function showBoxes(show) {
    if (!show) {  // HIDE
        toggleModel(models['boxes1'], false);
        toggleModel(models['boxes2'], false);
        if (pathShowed) {
            toggleModel(modelFrom, true);
            toggleModel(modelTo, true);
        }
        return;
    }
    // SHOW
    if (window.myFocus == 'building') {
        toggleModel(models['boxes1'], true);
        toggleModel(models['boxes2'], true);
    }
    if (window.myFocus == 'floor1') {
        toggleModel(models['boxes1'], true);
    }
    if (window.myFocus == 'floor2') {
        toggleModel(models['boxes2'], true);
    }
}

function showNav(show) {
    if (!show) {  // HIDE
        toggleModel(models['nav1'], false);
        toggleModel(models['nav2'], false);
        return;
    }
    // SHOW
    if (window.myFocus == 'building') {
        toggleModel(models['nav1'], true);
        toggleModel(models['nav2'], true);
    }
    if (window.myFocus == 'floor1') {
        toggleModel(models['nav1'], true);
    }
    if (window.myFocus == 'floor2') {
        toggleModel(models['nav2'], true);
    }
}

/* -------------------- PATH MAKING FUNCTIONS --------------------*/

function nearlyEqual(a, b, percent) {
    let diff = Math.abs(a - b);
    if (diff <= Math.abs(a)*percent) {
        return true;
    }
    return false;
}

function nearlyEqualVectors(a, b, percent) {
    if (
        nearlyEqual(a.x, b.x, percent) &&
        nearlyEqual(a.y, b.y, percent) &&
        nearlyEqual(a.z, b.z, percent)
    ) {
        return true;
    }
    return false;
}

function makeClearPath(path) {
    let clearPath = new Array();
    clearPath.push(path[0]);
    for (let i = 0; i < path.length-2; i++) {
        let dirVector1 = new THREE.Vector3().subVectors(path[i], path[i+1]).normalize();
        let dirVector2 = new THREE.Vector3().subVectors(path[i+1], path[i+2]).normalize();
        if (!nearlyEqualVectors(dirVector1, dirVector2, 0.1)) {
            clearPath.push(path[i+1]);
        }
    }
    clearPath.push(path[path.length-1]);
    return clearPath;
}

function foundCornerCenter(pointA, pointB, pointC, radius) {
    let dirA = pointA.clone().sub(pointB);
    let dirC = pointC.clone().sub(pointB);
    let lendirA = dirA.length();
    let lendirC = dirC.length();
    dirA.normalize();
    dirC.normalize();
    let tanOver2 = dirA.clone().sub(dirC).length() / dirA.clone().add(dirC).length();
    if (tanOver2 == Infinity) {
        return [null, null, null, null];
    }
    let distToTangent = radius / tanOver2;
    distToTangent = Math.min(distToTangent, lendirA*0.5, lendirC*0.5);
    radius = tanOver2 * distToTangent;
    let angleOver2 = Math.atan(tanOver2);
    let angle = Math.PI - angleOver2*2;
    let distToCenter = radius / Math.sin(angleOver2);
    let dirCenter = dirA.clone().add(dirC).normalize().multiplyScalar(distToCenter);
    let center = pointB.clone().add(dirCenter);
    let pointStart = dirA.clone().multiplyScalar(distToTangent).add(pointB);
    let pointEnd = dirC.clone().multiplyScalar(distToTangent).add(pointB);
    return [center, angle, pointStart, pointEnd];
}

function makeMyPath(path, radius = 1, segmentAngle = 0.5 * Math.PI / 30) {
    path = makeClearPath(path);
    let myPath = new Array();
    myPath.push(path[0]);
    for (let i = 1; i < path.length-1; i++) {
        let pointA = path[i-1],
            pointB = path[i],
            pointC = path[i+1];
        
        let [center, angle, pointStart, pointEnd] = foundCornerCenter(pointA, pointB, pointC, radius);
        if (center == null) {
            continue;
        }

        let plane = new THREE.Plane().setFromCoplanarPoints(pointA, pointB, pointC);
        let axis = plane.normal;
        let dirStart = pointStart.clone().sub(center);

        let currentAngle = segmentAngle;
        myPath.push(pointStart);
        /*myPath.push(pointStart.clone().add(new THREE.Vector3(0,0.2,0)));
        myPath.push(pointStart);
        myPath.push(pointStart.clone().add(new THREE.Vector3(0,-0.2,0)));
        myPath.push(pointStart);
        myPath.push(center);
        myPath.push(pointStart);*/
        while (currentAngle < angle) {
            let point = dirStart.clone().applyAxisAngle(axis, currentAngle).add(center);
            myPath.push(point);
            currentAngle += segmentAngle;
        }
        /*myPath.push(pointEnd);
        myPath.push(pointEnd.clone().add(new THREE.Vector3(0,0.2,0)));
        myPath.push(pointEnd);
        myPath.push(pointEnd.clone().add(new THREE.Vector3(0,-0.2,0)));
        myPath.push(pointEnd);
        myPath.push(center);*/
        myPath.push(pointEnd);
    }
    myPath.push(path[path.length-1]);
    return myPath;
}

function convertPathIntoPoints(path) {
    let yOffset = 0.4;
    let myPath = path.map(elem => {
        let office = Offices.find((element) => elem == element.name);
        return new THREE.Vector3(office.position[0], office.position[1]+yOffset, office.position[2]);
    });
    return myPath;
}

function drawPath(path, length) {
    window.scene.remove(modelPath);
    let newPath = convertPathIntoPoints(path);
    let smoothPath = makeMyPath(newPath);
    window.scene.remove(models['youAreHere']);
    models['youAreHere'].position.copy(smoothPath[0]);
    window.scene.add(models['youAreHere']);

    let curve = new THREE.CatmullRomCurve3(smoothPath);
    curve.curveType = 'catmullrom';
    curve.tension = 0;
    let points = curve.getPoints(Math.ceil(length*5));

    let geometry = new THREE.TubeGeometry(curve, Math.ceil(length*5), 0.12*arrowTipScale, 12, false);
    let material = new THREE.MeshBasicMaterial({color: 0xCE2718});
    modelPath = new THREE.Mesh(geometry, material);

    //geometry = new THREE.BufferGeometry().setFromPoints(smoothPath);
    geometry = new THREE.TubeGeometry(curve, 8000, 0.02, 10, false);
    modelPath = new THREE.Mesh(geometry, material);

    window.scene.add(modelPath);
    //animatePath(points);
}

/* -------------------- PATH ANIMATION --------------------*/

// async draw
async function moveCube(cube, smoothPath, startLength) {
    const velocity = 6;  // m / s
    const step = 0.05;  // m
    let traveledDist = 0;
    let reached = false;
    for (let i = 0; i < smoothPath.length-1; i++) {
        let point1 = smoothPath[i];
        let point2 = smoothPath[i+1];
        let dist = point1.distanceTo(point2);
        let steps = Math.max(1, Math.ceil(dist/step));
        let lookPos = point1.clone().sub(point2).normalize().multiplyScalar(dist*2).add(point2);
        let prevPosition = point1;
        for (let j = 0; j < steps; j++) {
            let position = new THREE.Vector3(
                (point1.x+j/(steps-j)*point2.x)/(j/(steps-j)+1),
                (point1.y+j/(steps-j)*point2.y)/(j/(steps-j)+1),
                (point1.z+j/(steps-j)*point2.z)/(j/(steps-j)+1)
            );
            traveledDist += position.distanceTo(prevPosition);
            if (cube.name == "delete") {
                console.log("delete");
                return;
            }
            cube.position.copy(position);
            cube.lookAt(lookPos);
            if (traveledDist >= startLength || reached) {
                reached = true;
                await sleep(dist/velocity*1000/steps, false);
            }
            prevPosition = position;
        }
        if (i == smoothPath.length-2) {
            if (!reached) {
                //window.scene.remove(cube);
                return;
            }
            i = -1;
        }
    }
}

async function animatePath(smoothPath) {
    Arrows.forEach(arrow => {
        window.scene.remove(arrow);
        arrow.name = "delete";
    });
    Arrows = [];
    
    let arrowLength = 4.5;

    let allDist = 0;
    for (let i = 0; i < smoothPath.length-1; i++) {
        let point1 = smoothPath[i];
        let point2 = smoothPath[i+1];
        let dist = point1.distanceTo(point2);
        allDist += dist;
    }
    let arrowAmount = Math.floor(allDist/arrowLength)-1;
    arrowLength = allDist/arrowAmount-0.1;

    for (let i = 0; i <= arrowAmount-1; i++) {
        let arrowTip = models['arrowTip'].clone();
        Arrows.push(arrowTip);
        arrowTip.name = "arrow"+i;
        let len = arrowLength;
        window.scene.add(arrowTip);
        moveCube(arrowTip, smoothPath, i*len);
    }
    return "Done";
}

/* -------------------- SMOOTH CAMERA ANIMATION --------------------*/

class ControlsAndCameraPreset {
    constructor(
            controlTarget,
            controlMinDist, controlTargetDist, controlMaxDist,
            controlMinAngle, controlTargetAngle, controlMaxAngle,
        ) {
        this.controlTarget = controlTarget;

        this.controlMinDist = controlMinDist;
        this.controlTargetDist = controlTargetDist;
        this.controlMaxDist = controlMaxDist;

        this.controlMinAngle = controlMinAngle;
        this.controlTargetAngle = controlTargetAngle;
        this.controlMaxAngle = controlMaxAngle;
    }
}

const ControlsAndCameraPresets = {
    'building': new ControlsAndCameraPreset(
        new THREE.Vector3(centerXOffset, 0.4, centerZOffset),
        24, 28, 36,
        Math.PI * 0.23, Math.PI * 0.38, Math.PI * 0.47
    ),
    'floor1': new ControlsAndCameraPreset(
        new THREE.Vector3(centerXOffset, 5.4, centerZOffset),
        11, 15, 17,
        Math.PI * 0.1, Math.PI * 0.16, Math.PI * 0.42
    ),
    'floor2': new ControlsAndCameraPreset(
        new THREE.Vector3(-6.29, 9.4, -11.22),
        8, 11, 13,
        Math.PI * 0.1, Math.PI * 0.16, Math.PI * 0.42
    )
}

async function switchControlsAndCameraToFocus() {
    let target = ControlsAndCameraPresets[window.myFocus];
    let prevTargetPoint = ControlsAndCameraPresets[prevTarget].controlTarget;
    controls.minDistance = window.camera.position.distanceTo(prevTargetPoint);
    controls.maxDistance = controls.minDistance;
    let angle = new THREE.Vector3(0,0,-1).applyQuaternion(window.camera.quaternion).angleTo(new THREE.Vector3(0,-1,0));
    controls.minPolarAngle = angle;
    controls.maxPolarAngle = angle;
    animateToTarget(
        controls,
        {
            target: target.controlTarget,
            minDistance: target.controlTargetDist,
            maxDistance: target.controlTargetDist,
            minPolarAngle: target.controlTargetAngle,
            maxPolarAngle: target.controlTargetAngle
        },
        800,
        () => {
            controls.minDistance = target.controlMinDist;
            controls.maxDistance = target.controlMaxDist;
            controls.minPolarAngle = target.controlMinAngle;
            controls.maxPolarAngle = target.controlMaxAngle;
        }
    );
    prevTarget = window.myFocus;
}

function animateToTarget(property, target, duration, func) {
    new TWEEN.Tween(property)
        .to(target, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onComplete(func)
        .start();
}

/* -------------------- WEB-SITE PANEL INIT --------------------*/

function init_ui() {
    let firstFloorBttn = document.getElementById('firstFloorBttn')
    let secondFloorBttn = document.getElementById('secondFloorBttn');

    let fireCheckBox = document.getElementById('fireCheckBox');
    let phoneCheckBox = document.getElementById('phoneCheckBox');
    let roomCheckBox = document.getElementById('roomCheckBox');
    let navCheckBox = document.getElementById('navCheckBox');

    let optionMenu1 = document.getElementById('optionMenu1');
    let optionMenu11 = document.getElementById('optionMenu11');
    let optionMenu2 = document.getElementById('optionMenu2');
    let optionMenu22 = document.getElementById('optionMenu22');

    let sendButton = document.getElementById('sendButton');
    let sendButton1 = document.getElementById('sendButton1');

    let legend = document.getElementById('legend');

    let exceptions = [
        'Теалет 1 поверх', 'Туалет 2 поверх', 'Кабінет №1 А'
    ];

    Offices.sort((a, b) => {
        if (a.name == "Реєстратура") {
            return -1;
        }
        if (b.name == "Реєстратура") {
            return 1;
        }
        if (a.name.substring(0,7) == "Кабінет" && b.name.substring(0,7) == "Кабінет") {
            let aNum = parseInt(a.name.substring(9));
            let bNum = parseInt(b.name.substring(9));
            if (aNum > bNum) {
                return 1;
            }
            return -1;
        }
        if (a.name > b.name) return 1;
        return -1;
    });

    for (let i = 0, j = 0; i < Offices.length; i++) {
        let option = Offices[i];
        let defaultOption = "ВИХІД";
        //defaultOption = "Кабінет №1";
        if (!exceptions.includes(option.name) && option.name.substring(0, 4) != "Node") {

            if (option.position[1] < 1) {
                firstFloorRooms.push(option.name);
            }else {
                secondFloorRooms.push(option.name);
            }
            let optionElement = document.createElement('input');
            optionElement.type = "radio";
            optionElement.name = "item";
            optionElement.id = "item"+j;
            optionElement.title = option.name;
            if (option.name == defaultOption || j == 0) {
                optionElement.checked = true;
            }
            if (option.name == "ВИХІД") {
                optionElement.title = "ВХІД";
            }
            if (option.name == "ВИХІД 2") {
                continue;
            }
            optionElement.addEventListener('change', onRadiosChange);
            optionMenu1.appendChild(optionElement);

            let optionElement1 = document.createElement('label');
            optionElement1.htmlFor = optionElement.id;
            optionElement1.textContent = optionElement.title;
            let optionElement2 = document.createElement('li');
            optionElement2.appendChild(optionElement1);
            optionMenu11.appendChild(optionElement2);

            j++;
        }
    }

    for (let i = 0, j = 0; i < Offices.length; i++) {
        let option = Offices[i];
        let defaultOption = "Реєстратура";
        //defaultOption = "Кабінет №30";
        if (!exceptions.includes(option.name) && option.name.substring(0, 4) != "Node") {
            let optionElement = document.createElement('input');
            optionElement.type = "radio";
            optionElement.name = "_item";
            optionElement.id = "_item"+j;
            optionElement.title = option.name;
            if (option.name == "ВИХІД 2") {
                continue;
            }
            if (option.name == defaultOption || j == 0) {
                optionElement.checked = true;
            }
            optionElement.addEventListener('change', onRadiosChange);
            optionMenu2.appendChild(optionElement);

            let optionElement1 = document.createElement('label');
            optionElement1.htmlFor = optionElement.id;
            optionElement1.textContent = optionElement.title;
            let optionElement2 = document.createElement('li');
            optionElement2.appendChild(optionElement1);
            optionMenu22.appendChild(optionElement2);

            j++;
        }
    }

    function onClickFirstFloor() {
        switch(window.myFocus) {
            case 'floor1':
                window.myFocus = 'building';
                firstFloorBttn.classList.remove("selected");
                showFirstFloor(false);
                showSecondFloor(false);
            break;
            case 'floor2':
                window.myFocus = 'floor1';
                secondFloorBttn.classList.remove("selected");
                firstFloorBttn.classList.add("selected");
                showFirstFloor(true);
                showSecondFloor(false);
            break;
            case 'building':
                window.myFocus = 'floor1';
                firstFloorBttn.classList.add("selected");
                showFirstFloor(true);
                showSecondFloor(false);
            break;
        }
        switchControlsAndCameraToFocus();
    }

    function onClickSecondFloor() {
        switch(window.myFocus) {
            case 'floor2':
                window.myFocus = 'building';
                secondFloorBttn.classList.remove("selected");
                showFirstFloor(false);
                showSecondFloor(false);
            break;
            case 'floor1':
                window.myFocus = 'floor2';
                firstFloorBttn.classList.remove("selected");
                secondFloorBttn.classList.add("selected");
                showFirstFloor(false);
                showSecondFloor(true);
            break;
            case 'building':
                window.myFocus = 'floor2';
                secondFloorBttn.classList.add("selected");
                showFirstFloor(false);
                showSecondFloor(true);
            break;
        }
        switchControlsAndCameraToFocus();
    }

    function onClick() {
        let selectedOption1;
        let children1 = optionMenu1.children;
        for (let i = 0; i < children1.length; i++) {
            if (children1[i].checked) {
                selectedOption1 = children1[i].title;
                break;
            }
        }
        console.log("Початок маршруту:  "+selectedOption1);
        //
        let selectedOption2;
        let children2 = optionMenu2.children;
        for (let i = 0; i < children2.length; i++) {
            if (children2[i].checked) {
                selectedOption2 = children2[i].title;
                break;
            }
        }
        console.log("Кінець маршруту:  "+selectedOption2);
        if (selectedOption1 == selectedOption2) {
            return;
        }
        //
        if (!window.options['boxes']) {
            toggleModel(modelFrom, false);
        }
        modelFrom = null;
        if (selectedOption1.substring(0,7) == "Кабінет") {
            let roomName1 = "Room_"+selectedOption1.substring(9);
            modelFrom = window.scene.getObjectByName(roomName1);
            toggleModel(modelFrom, true);
        }
        //
        if (!window.options['boxes']) {
            toggleModel(modelTo, false);
        }
        modelTo = null;
        if (selectedOption2.substring(0,7) == "Кабінет") {
            let roomName2 = "Room_"+selectedOption2.substring(9);
            modelTo = window.scene.getObjectByName(roomName2);
            toggleModel(modelTo, true);
        }
        //
        if (selectedOption1 == 'ВХІД') {
            selectedOption1 = 'ВИХІД';
        }
        //
        sameFloor = false;
        if (firstFloorRooms.includes(selectedOption1) == firstFloorRooms.includes(selectedOption2)) {
            sameFloor = true;
        }
        console.log("sameFloor:  "+sameFloor);
        //
        if (firstFloorRooms.includes(selectedOption1)) {
            if (window.myFocus != 'floor1') {
                onClickFirstFloor();
            }
        }else {
            if (window.myFocus != 'floor2') {
                onClickSecondFloor();
            }
        }
        //
        if (selectedOption2 == 'ВИХІД') {
            findPath(selectedOption1);
        }else {
            findPathToOffice(selectedOption1, selectedOption2);
        }
        //
        pathShowed = false;
        onClickTogglePath();
    }

    function onChangeFire() {
        if (!window.options['fire']) {
            window.options['fire'] = true;
            showFire(true);
        } else {
            window.options['fire'] = false;
            showFire(false);
        }
    }

    function onChangePhone() {
        if (!window.options['phone']) {
            window.options['phone'] = true;
            showPhone(true);
        } else {
            window.options['phone'] = false;
            showPhone(false);
        }
    }

    function onChangeBoxes() {
        if (!window.options['boxes']) {
            window.options['boxes'] = true;
            showBoxes(true);
        } else {
            window.options['boxes'] = false;
            showBoxes(false);
        }
    }

    function onChangeNav() {
        if (!window.options['nav']) {
            window.options['nav'] = true;
            showNav(true);
            legend.classList.remove("hidden");
        } else {
            window.options['nav'] = false;
            showNav(false);
            legend.classList.add("hidden");
        }
    }

    //var prev1 = null, prev2 = null;

    function onRadiosChange() {
        console.log("Changed:  " + this.title);
    }

    function onClickTogglePath() {
        if (!modelPath) {
            console.log("path doesnt exist");
            return;
        }
        pathShowed = !pathShowed;
        if (pathShowed) {
            sendButton1.textContent = "Приховати";
        }else {
            sendButton1.textContent = "Показати";
        }
        if (!sameFloor) {
            if (window.myFocus == 'floor1') {
                if (pathShowed) {
                    setOpacity(models['floor2'], 0.1);
                    toggleModel(models['floor2'], true);
                }else {
                    setOpacity(models['floor2']);
                    toggleModel(models['floor2'], false);
                }
            }else if (window.myFocus == 'floor2') {
                if (pathShowed) {
                    setOpacity(models['floor1'], 0.1);
                    toggleModel(models['floor1'], true);
                }else {
                    setOpacity(models['floor1']);
                    toggleModel(models['floor1'], false);
                }
            }
        }else {
            if (window.myFocus == 'floor1') {
                setOpacity(models['floor2']);
                toggleModel(models['floor2'], false);
            }else if (window.myFocus == 'floor2') {
                setOpacity(models['floor1']);
                toggleModel(models['floor1'], false);
            }
        }
        toggleModel(modelPath, pathShowed);
        toggleModel(modelFrom, pathShowed);
        toggleModel(modelTo, pathShowed);
        if (window.options['boxes']) {
            toggleModel(modelFrom, true);
            toggleModel(modelTo, true);
        }
        Arrows.forEach(arrow => {
            toggleModel(arrow, pathShowed);
        });
    }

    //

    sendButton.addEventListener('click', onClick);
    sendButton1.addEventListener('click', onClickTogglePath);

    firstFloorBttn.addEventListener('click', onClickFirstFloor);
    secondFloorBttn.addEventListener('click', onClickSecondFloor);

    fireCheckBox.addEventListener('change', onChangeFire);
    phoneCheckBox.addEventListener('change', onChangePhone);
    roomCheckBox.addEventListener('change', onChangeBoxes);
    navCheckBox.addEventListener('change', onChangeNav);

    //

    window.setRoomFrom = function(option) {
        let children1 = optionMenu1.children;
        for (let i = 0; i < children1.length; i++) {
            if (children1[i].title == option) {
                children1[i].checked = true;
                break;
            }
        }
    }
    
    window.setRoomTo = function(option) {
        let children2 = optionMenu2.children;
        for (let i = 0; i < children2.length; i++) {
            if (children2[i].title == option) {
                children2[i].checked = true;
                break;
            }
        }
    }
}

// -------------------- THREE JS INIT -------------------- //

function init() {
    const container = document.getElementById('threejs');

    // camera setup
    window.camera = new THREE.PerspectiveCamera(75,  (window.innerWidth - 440) / window.innerHeight, 0.1, 1000);
    window.camera.position.set(19.42, 6.59, -18.12);
    window.camera.rotation.set(-2.79, 0.959, 2.85);

    // scene setup
    window.scene = new THREE.Scene();
    window.scene.background = new THREE.Color(0x383838);
    window.scene.fog = new THREE.Fog(0x383839, 50, 80);
    
    // light setup
    const hemiLight = new THREE.HemisphereLight(0xfffff9, 0x8d8d8d, 3);
    hemiLight.position.set(0, 40, 0);
    window.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffef, 3);
    dirLight.position.set(-3, 10, -10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 2;
    dirLight.shadow.camera.bottom = - 2;
    dirLight.shadow.camera.left = - 2;
    dirLight.shadow.camera.right = 2;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    window.scene.add(dirLight);

    // grid setup
    const grid = new THREE.GridHelper(250, 100, 0x2f2f2f, 0x8f8f8f);
    grid.position.set(centerXOffset, -0.1, centerZOffset);
    window.scene.add(grid);

    // load 3D models
    loader = new GLTFLoader();
    gltfLoad('static/models/Hospital_Solid.glb', 'building', true, true);

    gltfLoad('static/models/First_Floor.glb', 'floor1', false, true);
    gltfLoad('static/models/Second_Floor.glb', 'floor2', false, true);

    gltfLoad('static/models/Fire_Ext_1.glb', 'fire1', false, true);
    gltfLoad('static/models/Fire_Ext_2.glb', 'fire2', false, true);

    gltfLoad('static/models/Phones_1.glb', 'phone1', false, true);
    gltfLoad('static/models/Phones_2.glb', 'phone2', false, true);

    gltfLoad('static/models/Navigation_1.glb', 'nav1', false, true);
    gltfLoad('static/models/Navigation_2.glb', 'nav2', false, true);

    gltfLoad('static/models/Hospital_Selection_Boxes_FirstFloor1.glb', 'boxes1', false, true);
    gltfLoad('static/models/Hospital_Selection_Boxes_SecondFloor1.glb', 'boxes2', false, true);

    gltfLoad('static/models/U_are_Here.glb', 'youAreHere', true, false, 0.4);
    gltfLoad('static/models/Arrow_Tip.glb', 'arrowTip', true, false, arrowTipScale);

    // renderer setup
    window.renderer = new THREE.WebGLRenderer();
    window.renderer.setSize(container.offsetWidth, window.innerHeight);
    //window.renderer.shadowMapEnabled = true;
    window.renderer.toneMapping = THREE.ReinhardToneMapping;
    window.renderer.shadowMap.enabled = true;
    window.renderer.shadowMap.autoUpdate = true;
    window.renderer.receiveShadow = true;
    window.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(window.renderer.domElement);

    // controls setup
    controls = new OrbitControls(window.camera, window.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.17;
    controls.target = new THREE.Vector3(centerXOffset, 2.4, centerZOffset);
    //controls.enablePan = false;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.65;

    controls.minDistance = 0;
    controls.maxDistance = 36;

    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = Math.PI * 0.23;

    init_graph();
    init_ui();
}

// -------------------- START -------------------- //

init();

// animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    TWEEN.update();
    toggleModel(models['floor1'], false);
    toggleModel(models['floor2'], false);
    controls.minDistance = 0;
    window.renderer.render(window.scene, window.camera);
}
animate();
