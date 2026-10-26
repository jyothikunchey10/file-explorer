
const STORAGE_KEY = "myFileExplorer";

let items = [];
let currentFolder = null;
let editingFileId = null;

// Load previously saved files and folders.
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];

    items = Array.isArray(parsed) ? parsed : [];
} catch (error) {
    items = [];
    console.error("Could not load saved data:", error);
}

// Save all files and folders.
function saveItems() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        return true;
    } catch (error) {
        showStatus(
            "Storage is full or unavailable. Download files or use IndexedDB.",
            true
        );
        console.error(error);
        return false;
    }
}

function showStatus(message, isError = false) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.style.color = isError ? "#dc2626" : "#15803d";
}

function getItem(id) {
    return items.find(item => item.id === id);
}

function makeId() {
    return crypto.randomUUID();
}

// Build a readable path for an item.
function getPath(item) {
    const names = [item.name];
    let parentId = item.parentId;
    let steps = 0;

    while (parentId !== null && steps++ < items.length) {
        const parent = getItem(parentId);

        if (!parent) break;

        names.unshift(parent.name);
        parentId = parent.parentId;
    }

    return "Home / " + names.join(" / ");
}

// Create a new folder.
function createFolder() {
    const name = prompt("Enter folder name:");

    if (!name || !name.trim()) return;

    items.push({
        id: makeId(),
        name: name.trim(),
        type: "folder",
        parentId: currentFolder,
        content: "",
        modified: Date.now()
    });

    if (!saveItems()) {
        items.pop();
        return;
    }

    renderItems();
    showStatus("Folder created successfully.");
}

// Create a new text file and open the editor.
function createFile() {
    const name = prompt(
        "Enter file name (example: notes.txt):"
    );

    if (!name || !name.trim()) return;

    const fileName = name.trim();

    items.push({
        id: makeId(),
        name: fileName,
        type: "file",
        parentId: currentFolder,
        content: "",
        mimeType: "text/plain",
        dataUrl: null,
        modified: Date.now()
    });

    const file = items[items.length - 1];

    if (!saveItems()) {
        items.pop();
        return;
    }

    renderItems();
    openFile(file.id);
}

// Open a folder.
function openFolder(id) {
    const folder = getItem(id);

    if (!folder || folder.type !== "folder") return;

    currentFolder = id;
    cancelEditor();
    renderItems();
}

// Return to the parent folder.
function goBack() {
    if (currentFolder === null) return;

    const folder = getItem(currentFolder);

    currentFolder = folder ? folder.parentId : null;

    cancelEditor();
    renderItems();
}

// Return to the root folder.
function goHome() {
    currentFolder = null;
    cancelEditor();
    renderItems();
}

// Check whether a file can be edited as text.
function isTextFile(file) {
    const name = file.name.toLowerCase();

    return (
        file.dataUrl == null &&
        (
            (file.mimeType || "").startsWith("text/") ||
            /\.(txt|md|csv|json|html|css|js|xml|log|py|java|php|sql|yml|yaml|svg)$/.test(name)
        )
    );
}

// Open a text file in the editor.
function openFile(id) {
    const file = getItem(id);

    if (!file || file.type !== "file") return;

    if (!isTextFile(file)) {
        showStatus(
            "This is not a text file. Use Download to open it.",
            true
        );
        return;
    }

    editingFileId = id;

    document.getElementById("editorTitle").textContent =
        "Editing: " + file.name;

    document.getElementById("editorContent").value =
        file.content || "";

    document.getElementById("editorPanel").hidden = false;
    document.getElementById("editorContent").focus();
}

// Save text editor content.
function saveEditor() {
    const file = getItem(editingFileId);

    if (!file || file.type !== "file") {
        showStatus("No file is selected.", true);
        return;
    }

    const previousContent = file.content;
    const previousModified = file.modified;

    file.content = document.getElementById("editorContent").value;
    file.dataUrl = null;
    file.modified = Date.now();

    if (!saveItems()) {
        file.content = previousContent;
        file.modified = previousModified;
        return;
    }

    renderItems();
    showStatus("File saved successfully.");
}

// Close the editor.
function cancelEditor() {
    editingFileId = null;
    document.getElementById("editorPanel").hidden = true;
    document.getElementById("editorContent").value = "";
}

// Rename a file or folder.
function renameItem(id) {
    const item = getItem(id);

    if (!item) return;

    const name = prompt("Enter the new name:", item.name);

    if (!name || !name.trim()) return;

    const newName = name.trim();

    if (newName === item.name) return;

    const oldName = item.name;
    const oldModified = item.modified;

    item.name = newName;
    item.modified = Date.now();

    if (!saveItems()) {
        item.name = oldName;
        item.modified = oldModified;
        return;
    }

    if (editingFileId === id) {
        document.getElementById("editorTitle").textContent =
            "Editing: " + item.name;
    }

    renderItems();
    showStatus("Renamed successfully.");
}

// Check whether a folder is inside another folder.
function isDescendant(folderId, possibleAncestorId) {
    let parentId = folderId;
    let steps = 0;

    while (parentId !== null && steps++ <= items.length) {
        if (parentId === possibleAncestorId) return true;

        const parent = getItem(parentId);
        if (!parent) return false;

        parentId = parent.parentId;
    }

    return false;
}

// Delete an item and everything inside its folder.
function deleteItem(id) {
    const item = getItem(id);

    if (!item) return;

    if (!confirm("Delete " + item.name + " and its contents?")) {
        return;
    }

    const idsToDelete = [id];

    for (let i = 0; i < idsToDelete.length; i++) {
        items.forEach(child => {
            if (
                child.parentId === idsToDelete[i] &&
                !idsToDelete.includes(child.id)
            ) {
                idsToDelete.push(child.id);
            }
        });
    }

    const previousItems = items;
    const previousFolder = currentFolder;
    const previousEditor = editingFileId;

    items = items.filter(
        item => !idsToDelete.includes(item.id)
    );

    if (idsToDelete.includes(currentFolder)) {
        currentFolder = null;
    }

    if (idsToDelete.includes(editingFileId)) {
        cancelEditor();
    }

    if (!saveItems()) {
        items = previousItems;
        currentFolder = previousFolder;

        if (previousEditor !== null) {
            openFile(previousEditor);
        }

        renderItems();
        return;
    }

    renderItems();
    showStatus("Item deleted successfully.");
}

// Return all folders that can be selected as a destination.
function getFolders() {
    return items.filter(item => item.type === "folder");
}

// Copy a file or an entire folder tree.
function copyItem(id) {
    const source = getItem(id);

    if (!source) return;

    const copyName = prompt(
        "Enter a name for the copy:",
        "Copy of " + source.name
    );

    if (!copyName || !copyName.trim()) return;

    const destination = currentFolder;

    const newItems = [];

    function duplicateTree(original, parentId, rootName) {
        const copy = {
            ...original,
            id: makeId(),
            name: rootName || original.name,
            parentId: parentId,
            modified: Date.now()
        };

        newItems.push(copy);

        if (original.type === "folder") {
            const children = items.filter(
                child => child.parentId === original.id
            );

            children.forEach(child => {
                duplicateTree(child, copy.id, null);
            });
        }
    }

    duplicateTree(source, destination, copyName.trim());

    items.push(...newItems);

    if (!saveItems()) {
        items.splice(items.length - newItems.length, newItems.length);
        return;
    }

    renderItems();
    showStatus("Copy created successfully.");
}

// Move a file or folder into another folder.
function moveItem(id) {
    const item = getItem(id);

    if (!item) return;

    const folders = getFolders().filter(folder =>
        folder.id !== id &&
        !isDescendant(folder.id, id)
    );

    const destinations = [
        { id: null, path: "Home (root folder)" },
        ...folders.map(folder => ({
            id: folder.id,
            path: getPath(folder)
        }))
    ];

    const instructions = destinations
        .map((destination, index) =>
            `${index}: ${destination.path}`
        )
        .join("\n");

    const answer = prompt(
        "Choose a destination number:\n\n" + instructions,
        "0"
    );

    if (answer === null || answer.trim() === "") return;

    const index = Number(answer);

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= destinations.length
    ) {
        showStatus("Invalid destination number.", true);
        return;
    }

    const destinationId = destinations[index].id;

    if (destinationId === item.parentId) {
        showStatus("Item is already in that folder.");
        return;
    }

    const oldParentId = item.parentId;

    item.parentId = destinationId;
    item.modified = Date.now();

    if (!saveItems()) {
        item.parentId = oldParentId;
        return;
    }

    renderItems();
    showStatus("Item moved successfully.");
}

// Upload one or more files from the computer.
async function uploadFiles(event) {
    const files = Array.from(event.target.files || []);

    // Allow selecting the same file again later.
    event.target.value = "";

    for (const file of files) {
        try {
            const data = await readFile(file);

            const uploadedItem = {
                id: makeId(),
                name: file.name,
                type: "file",
                parentId: currentFolder,
                mimeType: file.type || "application/octet-stream",
                content: data.isText ? data.content : "",
                dataUrl: data.isText ? null : data.dataUrl,
                modified: Date.now()
            };

            items.push(uploadedItem);

            if (!saveItems()) {
                items.pop();
                return;
            }
        } catch (error) {
            console.error(error);
            showStatus("Could not upload " + file.name, true);
            continue;
        }
    }

    renderItems();
    showStatus("Upload finished.");
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const name = file.name.toLowerCase();

        const textExtensions =
            /\.(txt|md|csv|json|html|css|js|xml|log|py|java|php|sql|yml|yaml|svg)$/;

        const isText =
            (file.type.startsWith("text/") ||
             textExtensions.test(name)) &&
            !file.type.includes("javascript");

        reader.onload = () => {
            if (isText) {
                resolve({
                    isText: true,
                    content: reader.result,
                    dataUrl: null
                });
            } else {
                resolve({
                    isText: false,
                    content: "",
                    dataUrl: reader.result
                });
            }
        };

        reader.onerror = () => reject(reader.error);

        if (isText) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    });
}

// Download a stored file.
function downloadFile(id) {
    const file = getItem(id);

    if (!file || file.type !== "file") return;

    let url;

    if (file.dataUrl) {
        url = file.dataUrl;
    } else {
        const blob = new Blob(
            [file.content || ""],
            { type: file.mimeType || "text/plain" }
        );

        url = URL.createObjectURL(blob);
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;

    document.body.appendChild(link);
    link.click();
    link.remove();

    if (url.startsWith("blob:")) {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    showStatus("Download started.");
}

// Display items and handle search and sorting.
function renderItems() {
    const fileList = document.getElementById("fileList");
    const breadcrumb = document.getElementById("breadcrumb");
    const search = document.getElementById("searchInput").value
        .trim()
        .toLowerCase();

    fileList.replaceChildren();

    if (search) {
        breadcrumb.textContent = "Search results";
    } else if (currentFolder === null) {
        breadcrumb.textContent = "Home";
    } else {
        const folder = getItem(currentFolder);
        breadcrumb.textContent = folder ? getPath(folder) : "Home";
    }

    let visibleItems;

    if (search) {
        visibleItems = items.filter(item =>
            item.name.toLowerCase().includes(search)
        );
    } else {
        visibleItems = items.filter(
            item => item.parentId === currentFolder
        );
    }

    const sort = document.getElementById("sortSelect").value;

    visibleItems.sort((a, b) => {
        if (sort === "type") {
            return a.type.localeCompare(b.type) ||
                a.name.localeCompare(b.name);
        }

        if (sort === "newest") {
            return (b.modified || 0) - (a.modified || 0);
        }

        return a.name.localeCompare(b.name);
    });

    if (visibleItems.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-message";
        empty.textContent = search
            ? "No matching files or folders found."
            : "This folder is empty.";

        fileList.appendChild(empty);
        return;
    }

    visibleItems.forEach(item => {
        const row = document.createElement("div");
        row.className = "item";

        const nameBox = document.createElement("div");
        nameBox.className = "item-name";

        const name = document.createElement("span");
        name.textContent =
            (item.type === "folder" ? "📁 " : "📄 ") + item.name;

        if (item.type === "folder") {
            name.className = "folder-name";
            name.onclick = () => openFolder(item.id);
        }

        nameBox.appendChild(name);

        if (search) {
            const path = document.createElement("span");
            path.className = "item-meta";
            path.textContent = getPath(item);
            nameBox.appendChild(path);
        }

        const actions = document.createElement("div");
        actions.className = "item-actions";

        function addButton(label, callback, className = "") {
            const button = document.createElement("button");
            button.textContent = label;
            if (className) button.className = className;
            button.onclick = callback;
            actions.appendChild(button);
        }

        if (item.type === "file") {
            if (isTextFile(item)) {
                addButton("Edit", () => openFile(item.id));
            }

            addButton("Download", () => downloadFile(item.id));
        }

        addButton("Rename", () => renameItem(item.id));
        addButton("Copy", () => copyItem(item.id));
        addButton("Move", () => moveItem(item.id));
        addButton("Delete", () => deleteItem(item.id), "danger");

        row.appendChild(nameBox);
        row.appendChild(actions);
        fileList.appendChild(row);
    });
}

// Initial display.
renderItems();
