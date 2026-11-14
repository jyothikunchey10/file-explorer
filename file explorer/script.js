/ ========================================
// MY FILE EXPLORER
// Main JavaScript
// ========================================

const DB_NAME = "MyFileExplorerDB";
const STORE_NAME = "files";

let db;
let currentFolder = null;
let selectedId = null;
let clipboard = null;
let editorFileId = null;
let currentView = "grid";
let favoritesMode = false;
let previewURL = null;

// ========================================
// DATABASE - SAVE FILES PERMANENTLY
// ========================================

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = event => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = () => reject(request.error);
    });
}

function getAllItems() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function saveItem(item) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");

        transaction.objectStore(STORE_NAME).put(item);

        transaction.oncomplete = () => resolve(item);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

function deleteItemFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");

        transaction.objectStore(STORE_NAME).delete(id);

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
}

function generateId() {
    return crypto.randomUUID();
}

// ========================================
// HELPERS
// ========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showStatus(message) {
    document.getElementById("status").textContent = message;
}

function getFileType(item) {
    if (item.type === "folder") return "Folder";

    const extension = item.name.includes(".")
        ? item.name.split(".").pop().toUpperCase()
        : "FILE";

    return extension;
}

function getFileIcon(item) {
    if (item.type === "folder") return "📁";

    const name = item.name.toLowerCase();

    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/.test(name)) return "🖼️";
    if (/\.(pdf)$/.test(name)) return "📕";
    if (/\.(doc|docx)$/.test(name)) return "📘";
    if (/\.(xls|xlsx|csv)$/.test(name)) return "📊";
    if (/\.(mp3|wav|ogg)$/.test(name)) return "🎵";
    if (/\.(mp4|webm|mov)$/.test(name)) return "🎬";
    if (/\.(zip|rar|7z)$/.test(name)) return "📦";
    if (/\.(js|html|css|json|py|java|txt|md)$/.test(name)) return "📄";

    return "📃";
}

function formatSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const units = ["Bytes", "KB", "MB", "GB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));

    return (
        (bytes / Math.pow(1024, index)).toFixed(2) +
        " " +
        units[index]
    );
}

function formatDate(date) {
    return new Date(date).toLocaleString();
}

async function findItem(id) {
    const items = await getAllItems();
    return items.find(item => item.id === id);
}

// ========================================
// INITIALIZE APPLICATION
// ========================================

async function initializeExplorer() {
    try {
        await openDatabase();

        renderItems();

        document.getElementById("dropZone").addEventListener(
            "dragover",
            handleDragOver
        );

        document.getElementById("dropZone").addEventListener(
            "dragleave",
            handleDragLeave
        );

        document.getElementById("dropZone").addEventListener(
            "drop",
            handleDrop
        );

        document.addEventListener("keydown", handleKeyboard);

        document.getElementById("fileList").addEventListener(
            "click",
            handleFileClick
        );

        document.getElementById("fileList").addEventListener(
            "dblclick",
            handleFileDoubleClick
        );

        document.getElementById("fileList").addEventListener(
            "keydown",
            event => {
                if (event.key === "Enter" &&
                    event.target.classList.contains("file-card")) {
                    openItem(event.target.dataset.id);
                }
            }
        );

        // Restore theme preference
        if (localStorage.getItem("explorerTheme") === "dark") {
            document.body.classList.add("dark");
            document.getElementById("themeButton").textContent = "☀️ Light Mode";
        }

        showStatus("File Explorer is ready!");

    } catch (error) {
        console.error(error);
        showStatus("Unable to open file storage. Please check browser storage permissions.");
    }
}

document.addEventListener("DOMContentLoaded", initializeExplorer);

// ========================================
// CREATE NEW FOLDER
// ========================================

async function createFolder() {
    const name = prompt("Enter folder name:");

    if (!name || !name.trim()) return;

    const cleanName = name.trim();
    const items = await getAllItems();

    if (items.some(item =>
        item.parentId === currentFolder &&
        item.name.toLowerCase() === cleanName.toLowerCase()
    )) {
        alert("A file or folder with this name already exists.");
        return;
    }

    await saveItem({
        id: generateId(),
        name: cleanName,
        type: "folder",
        parentId: currentFolder,
        favorite: false,
        size: 0,
        mime: "",
        modified: Date.now()
    });

    renderItems();
    showStatus("Folder created successfully!");
}

// ========================================
// CREATE NEW TEXT FILE
// ========================================

async function createFile() {
    const name = prompt("Enter text file name:", "New File.txt");

    if (!name || !name.trim()) return;

    let fileName = name.trim();

    if (!fileName.includes(".")) {
        fileName += ".txt";
    }

    const items = await getAllItems();

    if (items.some(item =>
        item.parentId === currentFolder &&
        item.name.toLowerCase() === fileName.toLowerCase()
    )) {
        alert("An item with this name already exists.");
        return;
    }

    const item = {
        id: generateId(),
        name: fileName,
        type: "file",
        parentId: currentFolder,
        favorite: false,
        size: 0,
        mime: "text/plain",
        content: new Blob([""], { type: "text/plain" }),
        modified: Date.now()
    };

    await saveItem(item);

    renderItems();
    openEditor(item);
}

// ========================================
// UPLOAD FILES
// ========================================

async function uploadFiles(event) {
    const files = Array.from(event.target.files || []);

    await uploadFileArray(files);

    event.target.value = "";
}

async function uploadFileArray(files) {
    if (!files.length) return;

    try {
        for (const file of files) {
            const items = await getAllItems();

            let fileName = file.name;
            let counter = 1;

            while (items.some(item =>
                item.parentId === currentFolder &&
                item.name.toLowerCase() === fileName.toLowerCase()
            )) {
                const dot = file.name.lastIndexOf(".");
                const base = dot > 0 ? file.name.slice(0, dot) : file.name;
                const ext = dot > 0 ? file.name.slice(dot) : "";

                fileName = `${base} (${counter++})${ext}`;
            }

            await saveItem({
                id: generateId(),
                name: fileName,
                type: "file",
                parentId: currentFolder,
                favorite: false,
                size: file.size,
                mime: file.type || "application/octet-stream",
                content: file,
                modified: Date.now()
            });
        }

        renderItems();
        showStatus(`${files.length} file(s) uploaded successfully!`);

    } catch (error) {
        console.error(error);
        alert("Upload failed. Browser storage may be full.");
    }
}

// ========================================
// DRAG AND DROP UPLOAD
// ========================================

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add("drag-over");
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove("drag-over");
}

async function handleDrop(event) {
    event.preventDefault();

    event.currentTarget.classList.remove("drag-over");

    const files = Array.from(event.dataTransfer.files);

    await uploadFileArray(files);
}

// ========================================
// RENDER FILES AND FOLDERS
// ========================================

async function renderItems() {
    if (!db) return;

    const allItems = await getAllItems();

    const search = document.getElementById("searchInput").value
        .trim()
        .toLowerCase();

    const sort = document.getElementById("sortSelect").value;

    let items;

    if (favoritesMode) {
        items = allItems.filter(item => item.favorite);
    } else {
        items = allItems.filter(item => item.parentId === currentFolder);
    }

    if (search) {
        items = items.filter(item =>
            item.name.toLowerCase().includes(search)
        );
    }

    items.sort((a, b) => {
        if (sort === "name") {
            if (a.type !== b.type) {
                return a.type === "folder" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        }

        if (sort === "type") {
            return getFileType(a).localeCompare(getFileType(b));
        }

        if (sort === "newest") {
            return b.modified - a.modified;
        }

        if (sort === "oldest") {
            return a.modified - b.modified;
        }

        if (sort === "size") {
            return b.size - a.size;
        }

        return 0;
    });

    const fileList = document.getElementById("fileList");

    fileList.className =
        currentView === "grid" ? "file-grid" : "file-list";

    document.getElementById("itemCount").textContent =
        `${items.length} item(s)`;

    document.getElementById("folderHeading").textContent =
        favoritesMode ? "⭐ Favorites" : "Current Folder";

    if (currentView === "list") {
        fileList.innerHTML = `
            <div class="list-header">
                <span>Name</span>
                <span class="type-column">Type / Size</span>
                <span class="modified-column">Modified</span>
                <span>Actions</span>
            </div>
        `;
    } else {
        fileList.innerHTML = "";
    }

    if (items.length === 0) {
        fileList.innerHTML += `
            <div class="empty-state">
                <div style="font-size:45px">📂</div>
                <h3>No files or folders found</h3>
                <p>Create a folder or upload files to get started.</p>
            </div>
        `;
        updateNavigation(allItems);
        return;
    }

    for (const item of items) {
        const selected = selectedId === item.id ? "selected" : "";

        const name = escapeHTML(item.name);
        const icon = getFileIcon(item);
        const type = escapeHTML(getFileType(item));
        const modified = escapeHTML(formatDate(item.modified));
        const size = formatSize(item.size || 0);

        const actions = `
            <div class="card-actions">
                <button data-action="rename" data-id="${item.id}" title="Rename">✏️</button>
                <button data-action="details" data-id="${item.id}" title="Details">ℹ️</button>
                <button data-action="copy" data-id="${item.id}" title="Copy">📋</button>
                <button data-action="cut" data-id="${item.id}" title="Cut">✂️</button>
                <button data-action="favorite" data-id="${item.id}" title="Favorite">
                    ${item.favorite ? "⭐" : "☆"}
                </button>
                <button data-action="delete" data-id="${item.id}" title="Delete">🗑️</button>
            </div>
        `;

        if (currentView === "grid") {
            fileList.innerHTML += `
                <div class="file-card ${selected}"
                    data-id="${item.id}"
                    tabindex="0"
                    role="button"
                    aria-label="${name}">

                    <span class="favorite-star"
                        data-action="favorite"
                        data-id="${item.id}"
                        title="Toggle favorite">
                        ${item.favorite ? "★" : ""}
                    </span>

                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${name}</div>
                    <div class="file-meta">${type} · ${size}</div>

                    ${actions}
                </div>
            `;
        } else {
            fileList.innerHTML += `
                <div class="file-row ${selected}" data-id="${item.id}">
                    <span>${icon} ${name} ${item.favorite ? "⭐" : ""}</span>
                    <span class="type-column">${type} · ${size}</span>
                    <span class="modified-column">${modified}</span>
                    ${actions}
                </div>
            `;
        }
    }

    updateNavigation(allItems);
}

// ========================================
// NAVIGATION AND BREADCRUMBS
// ========================================

async function updateNavigation(allItems) {
    const breadcrumb = document.getElementById("breadcrumb");

    if (favoritesMode) {
        breadcrumb.textContent = "⭐ Favorites";
        return;
    }

    const path = [];
    let folderId = currentFolder;

    while (folderId) {
        const folder = allItems.find(item => item.id === folderId);

        if (!folder) break;

        path.unshift(folder);
        folderId = folder.parentId;
    }

    breadcrumb.textContent =
        "🏠 Home" +
        path.map(folder => " / " + folder.name).join("");
}

async function openItem(id) {
    const item = await findItem(id);

    if (!item) return;

    selectedId = id;

    if (item.type === "folder") {
        currentFolder = item.id;
        favoritesMode = false;
        document.getElementById("searchInput").value = "";
        renderItems();
        showStatus(`Opened folder: ${item.name}`);
    } else {
        const isText = item.mime?.startsWith("text/") ||
            /\.(txt|md|html|css|js|json|xml|csv)$/i.test(item.name);

        if (isText) {
            openEditor(item);
        } else {
            openPreview(item);
        }
    }
}

function goBack() {
    if (favoritesMode) {
        goHome();
        return;
    }

    if (!currentFolder) return;

    findItem(currentFolder).then(folder => {
        currentFolder = folder ? folder.parentId : null;
        selectedId = null;
        renderItems();
    });
}

function goHome() {
    currentFolder = null;
    selectedId = null;
    favoritesMode = false;

    document.getElementById("searchInput").value = "";

    renderItems();
    showStatus("You are at Home.");
}

function showFavorites() {
    favoritesMode = true;
    selectedId = null;
    renderItems();
}

// ========================================
// RENAME FILES AND FOLDERS
// ========================================

async function renameItem(id) {
    const item = await findItem(id);

    if (!item) return;

    const newName = prompt("Enter the new name:", item.name);

    if (!newName || !newName.trim()) return;

    const cleanName = newName.trim();
    const items = await getAllItems();

    if (items.some(other =>
        other.id !== id &&
        other.parentId === item.parentId &&
        other.name.toLowerCase() === cleanName.toLowerCase()
    )) {
        alert("Another item already has this name.");
        return;
    }

    item.name = cleanName;
    item.modified = Date.now();

    await saveItem(item);

    renderItems();
    showStatus("Renamed successfully!");
}

// ========================================
// DELETE FILES AND FOLDERS
// ========================================

async function deleteItem(id) {
    const item = await findItem(id);

    if (!item) return;

    const items = await getAllItems();

    const descendants = [];

    function collectChildren(parentId) {
        items.filter(child => child.parentId === parentId)
            .forEach(child => {
                descendants.push(child.id);

                if (child.type === "folder") {
                    collectChildren(child.id);
                }
            });
    }

    if (item.type === "folder") {
        collectChildren(item.id);
    }

    const total = descendants.length + 1;

    const confirmed = confirm(
        `Are you sure you want to delete "${item.name}"?\n\n` +
        `${total} item(s) will be deleted.`
    );

    if (!confirmed) return;

    for (const childId of descendants) {
        await deleteItemFromDB(childId);
    }

    await deleteItemFromDB(id);

    selectedId = null;

    renderItems();
    showStatus("Item(s) deleted successfully!");
}

// ========================================
// COPY, CUT AND PASTE
// ========================================

async function copyItem(id) {
    clipboard = {
        id,
        mode: "copy"
    };

    showStatus("Copied! Navigate to a folder and click Paste.");
}

async function cutItem(id) {
    clipboard = {
        id,
        mode: "cut"
    };

    showStatus("Cut! Navigate to a folder and click Paste.");
}

async function pasteItems() {
    if (!clipboard) {
        alert("Nothing to paste. Copy or cut an item first.");
        return;
    }

    if (clipboard.mode === "cut" && clipboard.id === currentFolder) {
        alert("You cannot move a folder into itself.");
        return;
    }

    const source = await findItem(clipboard.id);

    if (!source) {
        clipboard = null;
        alert("The original item no longer exists.");
        return;
    }

    if (source.parentId === currentFolder && clipboard.mode === "cut") {
        alert("The item is already in this folder.");
        return;
    }

    if (source.type === "folder") {
        const allItems = await getAllItems();
        let check = currentFolder;

        while (check) {
            if (check === source.id) {
                alert("You cannot paste a folder into its own subfolder.");
                return;
            }

            const parent = allItems.find(item => item.id === check);
            check = parent?.parentId || null;
        }
    }

    if (clipboard.mode === "cut") {
        const items = await getAllItems();

        if (items.some(item =>
            item.id !== source.id &&
            item.parentId === currentFolder &&
            item.name.toLowerCase() === source.name.toLowerCase()
        )) {
            alert("An item with the same name already exists here.");
            return;
        }

        source.parentId = currentFolder;
        source.modified = Date.now();

        await saveItem(source);

        clipboard = null;

        renderItems();
        showStatus("Item moved successfully!");
        return;
    }

    // Copy an entire folder and its contents.
    const allItems = await getAllItems();
    const idMap = new Map();

    function collectTree(parentId, parentCopyId) {
        const children = allItems.filter(item => item.parentId === parentId);

        return children.map(child => {
            const newId = generateId();
            idMap.set(child.id, newId);

            const cloned = {
                ...child,
                id: newId,
                parentId: parentCopyId,
                favorite: false,
                modified: Date.now()
            };

            return {
                original: child,
                cloned,
                children: child.type === "folder"
                    ? collectTree(child.id, newId)
                    : []
            };
        });
    }

    const existing = allItems.filter(item =>
        item.parentId === currentFolder
    );

    let newName = source.name;
    let counter = 1;

    while (existing.some(item =>
        item.name.toLowerCase() === newName.toLowerCase()
    )) {
        const dot = source.name.lastIndexOf(".");
        const base = source.type === "file" && dot > 0
            ? source.name.slice(0, dot)
            : source.name;
        const ext = source.type === "file" && dot > 0
            ? source.name.slice(dot)
            : "";

        newName = `${base} (Copy ${counter++})${ext}`;
    }

    const rootCopyId = generateId();

    const rootCopy = {
        ...source,
        id: rootCopyId,
        name: newName,
        parentId: currentFolder,
        favorite: false,
        modified: Date.now()
    };

    const tree = source.type === "folder"
        ? collectTree(source.id, rootCopyId)
        : [];

    async function saveTree(nodes) {
        for (const node of nodes) {
            await saveItem(node.cloned);
            await saveTree(node.children);
        }
    }

    await saveItem(rootCopy);
    await saveTree(tree);

    renderItems();
    showStatus("Item copied successfully!");
}

// ========================================
// FAVORITES
// ========================================

async function toggleFavorite(id) {
    const item = await findItem(id);

    if (!item) return;

    item.favorite = !item.favorite;
    await saveItem(item);

    renderItems();

    showStatus(
        item.favorite
            ? "Added to Favorites ⭐"
            : "Removed from Favorites"
    );
}

// ========================================
// FILE INFORMATION / DETAILS
// ========================================

async function showDetails(id) {
    const item = await findItem(id);

    if (!item) return;

    const detailsPanel = document.getElementById("detailsPanel");

    document.getElementById("detailsContent").innerHTML = `
        <p><strong>Name:</strong> ${escapeHTML(item.name)}</p>
        <p><strong>Type:</strong> ${escapeHTML(getFileType(item))}</p>
        <p><strong>Size:</strong> ${formatSize(item.size || 0)}</p>
        <p><strong>Modified:</strong> ${escapeHTML(formatDate(item.modified))}</p>
        <p><strong>Location:</strong> ${escapeHTML(
            item.parentId ? (await findItem(item.parentId))?.name || "Home" : "Home"
        )}</p>
        <p><strong>Favorite:</strong> ${item.favorite ? "Yes ⭐" : "No"}</p>
    `;

    detailsPanel.hidden = false;
    detailsPanel.scrollIntoView({ behavior: "smooth" });
}

function closeDetails() {
    document.getElementById("detailsPanel").hidden = true;
}

// ========================================
// TEXT EDITOR
// ========================================

async function openEditor(item) {
    editorFileId = item.id;

    let content = "";

    if (item.content) {
        content = await item.content.text();
    }

    document.getElementById("editorTitle").textContent =
        "Editing: " + item.name;

    document.getElementById("editorContent").value = content;

    document.getElementById("editorPanel").hidden = false;

    document.getElementById("previewPanel").hidden = true;

    document.getElementById("editorPanel")
        .scrollIntoView({ behavior: "smooth" });
}

async function saveEditor() {
    if (!editorFileId) return;

    const item = await findItem(editorFileId);

    if (!item) return;

    const content = document.getElementById("editorContent").value;

    item.content = new Blob([content], {
        type: "text/plain"
    });

    item.size = item.content.size;
    item.mime = "text/plain";
    item.modified = Date.now();

    await saveItem(item);

    document.getElementById("editorPanel").hidden = true;

    editorFileId = null;

    renderItems();
    showStatus("File saved successfully!");
}

function cancelEditor() {
    const confirmed = confirm("Close editor without saving changes?");

    if (!confirmed) return;

    document.getElementById("editorPanel").hidden = true;
    editorFileId = null;
}

// ========================================
// FILE PREVIEW
// ========================================

async function openPreview(item) {
    closePreview();

    document.getElementById("previewTitle").textContent =
        "Preview: " + item.name;

    const previewContent = document.getElementById("previewContent");

    previewContent.innerHTML = "";

    const blob = item.content;

    if (!blob) {
        previewContent.textContent = "No preview available.";
    } else if (
        item.mime?.startsWith("image/") ||
        /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(item.name)
    ) {
        previewURL = URL.createObjectURL(blob);

        const img = document.createElement("img");
        img.src = previewURL;
        img.alt = item.name;

        previewContent.appendChild(img);

    } else if (
        item.mime?.startsWith("text/") ||
        /\.(txt|md|html|css|js|json|xml|csv)$/i.test(item.name)
    ) {
        const pre = document.createElement("pre");
        pre.textContent = await blob.text();

        previewContent.appendChild(pre);

    } else if (item.mime?.startsWith("video/")) {
        previewURL = URL.createObjectURL(blob);

        const video = document.createElement("video");
        video.src = previewURL;
        video.controls = true;
        video.style.maxWidth = "100%";

        previewContent.appendChild(video);

    } else if (item.mime?.startsWith("audio/")) {
        previewURL = URL.createObjectURL(blob);

        const audio = document.createElement("audio");
        audio.src = previewURL;
        audio.controls = true;

        previewContent.appendChild(audio);

    } else {
        previewContent.textContent =
            "Preview is not available for this file type. " +
            "You can still view its file information.";
    }

    document.getElementById("previewPanel").hidden = false;

    document.getElementById("editorPanel").hidden = true;

    document.getElementById("previewPanel")
        .scrollIntoView({ behavior: "smooth" });
}

function closePreview() {
    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }

    document.getElementById("previewPanel").hidden = true;
}

// ========================================
// GRID AND LIST VIEW
// ========================================

function setView(view) {
    currentView = view;

    document.getElementById("gridButton")
        .classList.toggle("view-active", view === "grid");

    document.getElementById("listButton")
        .classList.toggle("view-active", view === "list");

    renderItems();
}

// ========================================
// FILE CLICK EVENTS
// ========================================

async function handleFileClick(event) {
    const actionButton = event.target.closest("[data-action]");
