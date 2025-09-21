// ====== Rooms ======
const sampleRooms = [
  { id: '131', name: 'ห้อง 131', desc: 'HORWONG SCHOOL', building: '1' },
  { id: '132', name: 'ห้อง 132', desc: 'HORWONG SCHOOL', building: '1' },
];

let roomStatus = {};
let adminMode = false;

function renderRooms() {
  const container = document.getElementById('roomList');
  container.innerHTML = '';
  sampleRooms.forEach((room, idx) => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.textContent = room.name + ' - ' + room.desc;
    container.appendChild(div);
  });
}

// ===== Admin Mode =====
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
    adminMode = !adminMode;
    document.getElementById('adminPanel').classList.toggle('hidden', !adminMode);
    if (adminMode) loadClassSettings();
  }
});

document.getElementById('closeAdmin').onclick = () => {
  adminMode = false;
  document.getElementById('adminPanel').classList.add('hidden');
};

document.getElementById('addRoom').onclick = () => {
  const name = document.getElementById('roomName').value.trim();
  const building = document.getElementById('buildingName').value.trim();
  const desc = document.getElementById('roomDesc').value.trim();
  if (!name) return alert('กรุณากรอกชื่อห้อง');
  sampleRooms.push({ id: Date.now().toString(), name, building, desc });
  renderRooms();
  loadClassSettings();
};

function loadClassSettings() {
  const div = document.getElementById('classSettings');
  div.innerHTML = '';
  sampleRooms.forEach((room, rIdx) => {
    const roomDiv = document.createElement('div');
    roomDiv.className = 'admin-room-setting';
    roomDiv.innerHTML = '<h4>' + room.name + '</h4>';
    for (let i = 0; i < 9; i++) {
      if (!roomStatus[room.id]) roomStatus[room.id] = {};
      if (!roomStatus[room.id]['จันทร์']) roomStatus[room.id]['จันทร์'] = new Array(9).fill(false);
      const btn = document.createElement('button');
      const free = roomStatus[room.id]['จันทร์'][i];
      btn.textContent = 'คาบ ' + (i + 1) + ' : ' + (free ? 'ว่าง' : 'ไม่ว่าง');
      btn.className = free ? 'btn-free' : 'btn-busy';
      btn.onclick = () => {
        roomStatus[room.id]['จันทร์'][i] = !roomStatus[room.id]['จันทร์'][i];
        loadClassSettings();
      };
      roomDiv.appendChild(btn);
    }
    div.appendChild(roomDiv);
  });
}

renderRooms();