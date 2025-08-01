class AzureBlobExplorer {
    constructor() {
        this.currentPath = '';
        this.containerUrl = '';
        this.containerName = '';
        this.storageAccount = '';
        this.files = [];
        this.folders = new Set();
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('blobUrlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connect();
        });
        document.getElementById('refreshBtn').addEventListener('click', () => this.refresh());
    }

    async connect() {
        const urlInput = document.getElementById('blobUrlInput').value.trim();
        if (!urlInput) {
            this.showError('Please enter a valid Azure Blob Storage URL');
            return;
        }

        if (!this.parseAzureBlobUrl(urlInput)) {
            this.showError('Invalid Azure Blob Storage URL format. Expected: https://account.blob.core.windows.net/container');
            return;
        }

        this.showLoading(true);
        await this.loadContainerContents();
    }

    parseAzureBlobUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part);
            
            if (!urlObj.hostname.includes('.blob.core.windows.net') || pathParts.length < 1) {
                return false;
            }

            this.storageAccount = urlObj.hostname.split('.')[0];
            this.containerName = pathParts[0];
            this.containerUrl = `${urlObj.protocol}//${urlObj.hostname}/${this.containerName}`;
            this.currentPath = pathParts.slice(1).join('/');
            
            return true;
        } catch (error) {
            return false;
        }
    }

    async loadContainerContents(path = '') {
        try {
            this.showError('');
            this.showLoading(true);

            const url = new URL(this.containerUrl);
            url.searchParams.set('restype', 'container');
            url.searchParams.set('comp', 'list');
            
            if (path) {
                url.searchParams.set('prefix', path + (path.endsWith('/') ? '' : '/'));
            }

            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Container not found or not publicly accessible');
                } else if (response.status === 403) {
                    throw new Error('Access denied. Container must be publicly accessible');
                } else {
                    throw new Error(`Failed to fetch container contents: ${response.statusText}`);
                }
            }

            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            this.processContainerResponse(xmlDoc, path);
            this.renderFileList(path);
            this.showLoading(false);

        } catch (error) {
            this.showLoading(false);
            this.showError(`Error loading container: ${error.message}`);
        }
    }

    processContainerResponse(xmlDoc, currentPath) {
        this.files = [];
        this.folders = new Set();

        const blobs = xmlDoc.getElementsByTagName('Blob');
        const prefixLength = currentPath ? currentPath.length + (currentPath.endsWith('/') ? 0 : 1) : 0;

        for (let blob of blobs) {
            const nameElement = blob.getElementsByTagName('Name')[0];
            const lastModifiedElement = blob.getElementsByTagName('Last-Modified')[0];
            const sizeElement = blob.getElementsByTagName('Content-Length')[0];

            if (!nameElement) continue;

            const fullPath = nameElement.textContent;
            const relativePath = fullPath.substring(prefixLength);

            if (!relativePath) continue;

            const pathParts = relativePath.split('/');
            
            if (pathParts.length === 1) {
                this.files.push({
                    name: pathParts[0],
                    fullPath: fullPath,
                    size: sizeElement ? parseInt(sizeElement.textContent) : 0,
                    lastModified: lastModifiedElement ? new Date(lastModifiedElement.textContent) : null,
                    isFolder: false,
                    url: `${this.containerUrl}/${fullPath}`
                });
            } else if (pathParts[0]) {
                this.folders.add(pathParts[0]);
            }
        }

        Array.from(this.folders).forEach(folderName => {
            this.files.unshift({
                name: folderName,
                fullPath: currentPath ? `${currentPath}/${folderName}` : folderName,
                size: null,
                lastModified: null,
                isFolder: true,
                url: null
            });
        });
    }

    renderFileList(currentPath) {
        const fileList = document.getElementById('fileList');
        
        if (this.files.length === 0) {
            fileList.innerHTML = `
                <div class="welcome-message">
                    <h3>No files found</h3>
                    <p>This container appears to be empty or the path doesn't exist.</p>
                </div>
            `;
            return;
        }

        const fileGrid = document.createElement('div');
        fileGrid.className = 'file-grid';

        this.files.forEach(file => {
            const fileItem = this.createFileItem(file);
            fileGrid.appendChild(fileItem);
        });

        fileList.innerHTML = '';
        fileList.appendChild(fileGrid);
        
        this.updateBreadcrumbs(currentPath);
    }

    createFileItem(file) {
        const fileItem = document.createElement('div');
        fileItem.className = file.isFolder ? 'file-item folder-item' : 'file-item';
        
        const icon = this.getFileIcon(file);
        const size = file.size !== null ? this.formatFileSize(file.size) : '';
        const date = file.lastModified ? file.lastModified.toLocaleDateString() : '';

        fileItem.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name">${file.name}</div>
            ${!file.isFolder && (size || date) ? `<div class="file-metadata">${size} ${date}</div>` : ''}
        `;

        if (file.isFolder) {
            fileItem.addEventListener('click', () => this.navigateToFolder(file.fullPath));
        } else {
            fileItem.addEventListener('click', () => this.openFile(file));
        }

        return fileItem;
    }

    getFileIcon(file) {
        if (file.isFolder) return '📁';
        
        const extension = file.name.split('.').pop().toLowerCase();
        const iconMap = {
            'txt': '📄',
            'pdf': '📕',
            'doc': '📘',
            'docx': '📘',
            'xls': '📗',
            'xlsx': '📗',
            'png': '🖼️',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'gif': '🖼️',
            'mp4': '🎬',
            'avi': '🎬',
            'mov': '🎬',
            'mp3': '🎵',
            'wav': '🎵',
            'zip': '📦',
            'rar': '📦',
            'json': '📋',
            'xml': '📋',
            'csv': '📊'
        };

        return iconMap[extension] || '📄';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async navigateToFolder(folderPath) {
        this.currentPath = folderPath;
        await this.loadContainerContents(folderPath);
    }

    updateBreadcrumbs(currentPath) {
        const breadcrumbs = document.getElementById('breadcrumbs');
        breadcrumbs.innerHTML = '';

        const homeCrumb = document.createElement('span');
        homeCrumb.className = 'breadcrumb-item';
        homeCrumb.textContent = this.containerName;
        homeCrumb.setAttribute('data-path', '');
        homeCrumb.addEventListener('click', () => this.navigateToFolder(''));
        breadcrumbs.appendChild(homeCrumb);

        if (currentPath) {
            const pathParts = currentPath.split('/').filter(part => part);
            let buildPath = '';

            pathParts.forEach((part, index) => {
                buildPath += (index > 0 ? '/' : '') + part;
                
                const crumb = document.createElement('span');
                crumb.className = 'breadcrumb-item';
                crumb.textContent = part;
                crumb.setAttribute('data-path', buildPath);
                crumb.addEventListener('click', () => this.navigateToFolder(buildPath));
                breadcrumbs.appendChild(crumb);
            });
        }
    }

    openFile(file) {
        if (file.url) {
            window.open(file.url, '_blank');
        }
    }

    async refresh() {
        if (this.containerUrl) {
            await this.loadContainerContents(this.currentPath);
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        loading.style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        if (message) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        } else {
            errorElement.style.display = 'none';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AzureBlobExplorer();
});