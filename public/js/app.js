document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');
    const uploadSection = document.getElementById('upload-section');
    const dataSection = document.getElementById('data-section');
    const fileNameDisplay = document.getElementById('file-name-display');
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const btnReset = document.getElementById('btn-reset');
    const paginationControls = document.getElementById('pagination-controls');

    let currentData = [];
    let currentPage = 1;
    const rowsPerPage = 50;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight drop area
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
    });

    // Handle dropped files
    dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    // Handle selected files
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    const appContent = document.getElementById('app-content');
    const dashboardSection = document.getElementById('dashboard-section');
    const btnViewTable = document.getElementById('btn-view-table');
    const btnViewDashboard = document.getElementById('btn-view-dashboard');
    const btnExportFec = document.getElementById('btn-export-fec');

    let currentFileName = '';

    btnReset.addEventListener('click', () => {
        appContent.style.display = 'none';
        uploadSection.style.display = 'block';
        fileInput.value = '';
        uploadStatus.textContent = '';
        uploadStatus.className = 'status-message';
        dashboardRendered = false;
    });

    let dashboardRendered = false;

    // Navigation Logic
    btnViewTable.addEventListener('click', () => {
        btnViewTable.classList.add('active');
        btnViewDashboard.classList.remove('active');
        dataSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    });

    btnViewDashboard.addEventListener('click', () => {
        btnViewDashboard.classList.add('active');
        btnViewTable.classList.remove('active');
        dashboardSection.style.display = 'block';
        dataSection.style.display = 'none';

        if (!dashboardRendered && typeof calculateDashboard === 'function') {
            calculateDashboard(currentData);
            dashboardRendered = true;
        } else {
            // Resize if already rendered
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 10);
        }
    });

    // Export Logic (Excel)
    btnExportFec.addEventListener('click', () => {
        if (!currentData || currentData.length === 0) return;
        
        // Create a new workbook and add the data
        const ws = XLSX.utils.aoa_to_sheet(currentData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "FEC Anonymisé");
        
        // Generate filename
        const originalName = currentFileName.replace(/\.[^/.]+$/, "");
        const exportName = `${originalName}_Anonymise.xlsx`;
        
        // Trigger download
        XLSX.writeFile(wb, exportName);
    });

    // Export Logic (PDF)
    const btnExportPdf = document.getElementById('btn-export-pdf');
    if (btnExportPdf) {
        btnExportPdf.addEventListener('click', () => {
            const dashboardContent = document.querySelector('.dashboard-content');
            
            // Appliquer le mode PDF pour forcer un layout propre
            dashboardContent.classList.add('pdf-mode');
            btnExportPdf.style.display = 'none';
            
            // Forcer ECharts à se redimensionner avec la nouvelle largeur fixe
            window.dispatchEvent(new Event('resize'));
            
            // Attendre que le redimensionnement soit effectif
            setTimeout(() => {
                const opt = {
                    margin:       [10, 10, 10, 10], // top, left, bottom, right
                    filename:     `${currentFileName ? currentFileName.replace(/\.[^/.]+$/, "") : 'FEC'}_Dashboard.pdf`,
                    image:        { type: 'jpeg', quality: 0.98 },
                    html2canvas:  { scale: 2, useCORS: true, windowWidth: 1200, letterRendering: true },
                    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
                    pagebreak:    { mode: ['css', 'legacy'], before: '.pdf-page-break', avoid: ['.kpi-grid', '.chart-card'] }
                };

                html2pdf().set(opt).from(dashboardContent).save().then(() => {
                    // Restaurer l'affichage normal
                    dashboardContent.classList.remove('pdf-mode');
                    btnExportPdf.style.display = 'inline-block';
                    // Forcer ECharts à reprendre sa taille responsive
                    setTimeout(() => {
                        window.dispatchEvent(new Event('resize'));
                    }, 100);
                });
            }, 500); // 500ms laisse le temps aux graphiques de s'ajuster
        });
    }

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            uploadFile(file);
        }
    }

    function uploadFile(file) {
        // Validate file type
        const validExtensions = ['.xlsx', '.xls', '.csv'];
        const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        
        if (!isValid) {
            showStatus('Veuillez sélectionner un fichier Excel valide (.xlsx, .xls, .csv)', 'error');
            return;
        }

        showStatus('Chargement et analyse en cours...', '');
        
        const formData = new FormData();
        formData.append('file', file);

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showStatus(data.error, 'error');
            } else {
                showStatus('', '');
                currentFileName = data.filename;
                displayData(data.filename, data.data);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showStatus('Une erreur est survenue lors du chargement.', 'error');
        });
    }

    function showStatus(message, type) {
        uploadStatus.textContent = message;
        uploadStatus.className = 'status-message ' + type;
    }

    function displayData(filename, data) {
        fileNameDisplay.textContent = `Données : ${filename}`;
        currentData = data;
        currentPage = 1;
        
        uploadSection.style.display = 'none';
        appContent.style.display = 'block';
        
        // Setup Date Pickers if EcritureDate exists
        const headers = currentData[0] || [];
        const dateIndex = headers.indexOf('EcritureDate');
        
        const inputStart = document.getElementById('export-date-start');
        const inputEnd = document.getElementById('export-date-end');
        
        // Reset inputs first
        inputStart.value = ''; inputStart.min = ''; inputStart.max = '';
        inputEnd.value = ''; inputEnd.min = ''; inputEnd.max = '';

        if (dateIndex !== -1) {
            let minDate = null;
            let maxDate = null;

            for (let i = 1; i < currentData.length; i++) {
                const row = currentData[i];
                if (!row) continue;
                
                const val = row[dateIndex];
                if (val === undefined || val === null || val === '') continue;

                let dateObj = null;
                const valStr = String(val).trim();
                
                // Le format est AAAAMMDD (ex: 20220101)
                if (/^\d{8}$/.test(valStr)) {
                    const year = valStr.substring(0, 4);
                    const month = valStr.substring(4, 6);
                    const day = valStr.substring(6, 8);
                    dateObj = new Date(`${year}-${month}-${day}`);
                } else if (typeof val === 'number') {
                    // Si ce n'est pas 8 chiffres mais que c'est un nombre, c'est peut-être le format Excel standard (nombre de jours)
                    dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
                } else if (valStr.includes('/')) { 
                    // Format DD/MM/YYYY
                    const parts = valStr.split('/');
                    if (parts.length === 3) dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                } else {
                    dateObj = new Date(valStr);
                }

                if (dateObj && !isNaN(dateObj)) {
                    if (!minDate || dateObj < minDate) minDate = dateObj;
                    if (!maxDate || dateObj > maxDate) maxDate = dateObj;
                }
            }

            if (minDate && maxDate) {
                const formatDate = (d) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                };
                
                const minStr = formatDate(minDate);
                const maxStr = formatDate(maxDate);

                inputStart.value = minStr;
                inputStart.min = minStr;
                inputStart.max = maxStr;

                inputEnd.value = maxStr;
                inputEnd.min = minStr;
                inputEnd.max = maxStr;
            }
        }

        // Reset view to table by default
        btnViewTable.click();
        
        renderTable();
    }

    function renderTable() {
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';
        paginationControls.innerHTML = '';

        if (!currentData || currentData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="100%">Aucune donnée trouvée.</td></tr>';
            return;
        }

        // Header
        const headers = currentData[0] || [];
        const headerRow = document.createElement('tr');
        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText || '';
            headerRow.appendChild(th);
        });
        tableHead.appendChild(headerRow);

        // Body with Pagination
        const start = (currentPage - 1) * rowsPerPage + 1; // +1 to skip header
        const end = Math.min(start + rowsPerPage, currentData.length);
        
        for (let i = start; i < end; i++) {
            const row = currentData[i];
            if (!row) continue;
            
            const tr = document.createElement('tr');
            for(let j = 0; j < headers.length; j++) {
                const td = document.createElement('td');
                const cellValue = row[j];
                
                if (typeof cellValue === 'number') {
                    // Quick heuristic: If it looks like a year, don't format as currency/decimal
                    if (cellValue > 1900 && cellValue < 2100 && cellValue % 1 === 0) {
                        td.textContent = cellValue;
                    } else {
                        td.textContent = cellValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        td.style.textAlign = 'right';
                        td.style.fontWeight = '500';
                    }
                } else {
                    td.textContent = cellValue !== undefined && cellValue !== null ? cellValue : '';
                }
                tr.appendChild(td);
            }
            tableBody.appendChild(tr);
        }

        renderPagination();
    }

    function renderPagination() {
        const totalRows = currentData.length - 1; // Exclude header
        const totalPages = Math.ceil(totalRows / rowsPerPage);

        if (totalPages <= 1) return;

        const btnPrev = document.createElement('button');
        btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i> Précédent';
        btnPrev.disabled = currentPage === 1;
        btnPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
            }
        });

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${currentPage} sur ${totalPages}`;
        pageInfo.style.fontWeight = '500';
        pageInfo.style.color = 'var(--text-muted)';

        const btnNext = document.createElement('button');
        btnNext.innerHTML = 'Suivant <i class="fa-solid fa-chevron-right"></i>';
        btnNext.disabled = currentPage === totalPages;
        btnNext.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderTable();
            }
        });

        paginationControls.appendChild(btnPrev);
        paginationControls.appendChild(pageInfo);
        paginationControls.appendChild(btnNext);
    }
});
