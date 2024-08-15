import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';

window.raycaster = new THREE.Raycaster();
window.mouse = new THREE.Vector2();
var prevRoom;
var roomNameGlobal;

function onDocumentMouseMove(event) {
    event.preventDefault();
    mouse.x = ((event.clientX-440) / (window.innerWidth-440)) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    manageRaycasterIntersections(window.camera);
}

function onWindowResize() {
    //const container = document.getElementById('threejs');
    window.camera.aspect = (window.innerWidth - 440) / window.innerHeight;
    window.camera.updateProjectionMatrix();
    window.renderer.setSize(window.innerWidth - 440, window.innerHeight);
}

function manageRaycasterIntersections(camera) {
    camera.updateMatrixWorld();
    raycaster.setFromCamera(mouse, camera);
    let target = (window.myFocus == 'floor2') ? window.boxes2.children : window.boxes1.children;
    var intersects = raycaster.intersectObjects(target);

    if (!intersects[0]) {
        if (prevRoom) {
            deHighlightRoom(prevRoom);
            prevRoom = undefined;
        }
        return;
    }

    let room = intersects[0]['object'].parent;
    
    if (room.name.substring(0, 4) == "Room") {
        room.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
                if (child.visible) {
                    if (prevRoom != room) {
                        highlightRoom(room);
                    }
                }else {
                    room = undefined;
                }
            }
        });
    }

    if (prevRoom != room) {
        if (prevRoom) {
            deHighlightRoom(prevRoom);
        }
    }

    prevRoom = room;
}

function highlightRoom(room) {
    room.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
            new TWEEN.Tween(child.material)
                .to({opacity: 0.9}, 100)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
        }
    });
}

function deHighlightRoom(room) {
    room.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
            new TWEEN.Tween(child.material)
                .to({opacity: 0.5}, 100)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
        }
    });
}

function onMouseDown(event) {
    if (!prevRoom) {
        return;
    }
    let number = prevRoom.name.substring(5);
    let roomName;
    if (prevRoom.name == "Room_Pharmacy") {
        roomName = 'Аптека';
    }else if (prevRoom.name == "Room_Registry") {
        roomName = "Реєстратура";
    }else {
        roomName = "Кабінет №"+number;
        if (number == "30A") {
            roomName = "Кабінет №30 А";
        }
    }
    roomNameGlobal = roomName;
}

function onMouseUp(event) {
    if (!prevRoom) {
        return;
    }
    let number = prevRoom.name.substring(5);
    let roomName;
    if (prevRoom.name == "Room_Pharmacy") {
        roomName = 'Аптека';
    }else if (prevRoom.name == "Room_Registry") {
        roomName = "Реєстратура";
    }else {
        roomName = "Кабінет №"+number;
        if (number == "30A") {
            roomName = "Кабінет №30 А";
        }
    }
    if (roomName != roomNameGlobal) {
        return;
    }
    console.log("Changed by click:  "+roomName);
    if (event.button === 0) {  // LEFT click
        window.setRoomFrom(roomName);
    }else {  // RIGHT click
        window.setRoomTo(roomName);
    }
}

function init() {
    document.addEventListener('mousemove', onDocumentMouseMove, false);
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mouseup', onMouseUp, false);
    console.log("IMPORTED SUCCSESFULLY");
}

init();