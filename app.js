/**
 * My Duit - App Logic (Revisi dengan Template Fix)
 * Session menggunakan sessionStorage untuk keamanan dan konsistensi
 */

let currentPage = 1;
const rowsPerPage = 10;

$(document).ready(function () {
    // Cek Auth dari sessionStorage (sesi akan hilang saat browser ditutup)
    if (sessionStorage.getItem('isLoggedIn')) {
        $('#login-overlay').hide();
        initApp();
    }

    // Event Listeners
    $('#btn-login').on('click', checkLogin);
    $('#btn-logout').on('click', logout);
    $('#theme-toggle').on('click', toggleTheme);
    $('#btn-add-transaction').on('click', openTransactionModal);
    $('#btn-add-saving').on('click', openSavingModal);
    $('#btn-update-pin').on('click', updatePin);

    // Sidebar Navigation
    $('.sidebar-link').on('click', function (e) {
        e.preventDefault();
        const page = $(this).data('page');
        navigateTo(page);

        // Close sidebar on mobile after navigation
        if (window.innerWidth <= 991) {
            closeSidebar();
        }
    });

    // Mobile Sidebar Toggle
    $('#sidebar-toggle').on('click', openSidebar);
    $('#sidebar-overlay').on('click', closeSidebar);

    // Support login via tombol enter
    $('#pin-input').on('keypress', function (e) {
        if (e.which == 13) checkLogin();
    });

    // Inisialisasi tema yang tersimpan
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        $('body').addClass('dark-mode');
    }
});

// --- Inisialisasi Aplikasi ---
function initApp() {
    loadSummary();
    loadTransactions();
    loadQuickStats();
}

// --- Sidebar Navigation ---
function navigateTo(page) {
    // Update active link
    $('.sidebar-link').removeClass('active');
    $(`.sidebar-link[data-page="${page}"]`).addClass('active');

    // Show/hide page sections
    $('.page-section').removeClass('active');
    $(`#page-${page}`).addClass('active');

    // Load data berdasarkan halaman
    if (page === 'dashboard' || page === 'transactions') {
        currentPage = 1;
        loadSummary();
        loadTransactions();
        loadQuickStats();
    } else if (page === 'savings') {
        loadSavings();
    }
}

function openSidebar() {
    $('#sidebar').addClass('active');
    $('#sidebar-overlay').addClass('active');
}

function closeSidebar() {
    $('#sidebar').removeClass('active');
    $('#sidebar-overlay').removeClass('active');
}

// --- Authentication (Menggunakan sessionStorage untuk sesi yang konsisten) ---
function checkLogin() {
    const pin = $('#pin-input').val();
    $.post('api.php?action=login', { pin: pin }, function (res) {
        if (res.status === 'success') {
            // Gunakan sessionStorage - sesi akan hilang saat browser ditutup
            sessionStorage.setItem('isLoggedIn', 'true');
            $('#login-overlay').fadeOut();
            initApp();
        } else {
            Swal.fire({ icon: 'error', title: 'Akses Ditolak', text: 'PIN Salah!' });
        }
    }, 'json').fail(() => Swal.fire('Error', 'Gagal koneksi ke server', 'error'));
}

function logout() {
    Swal.fire({
        title: 'Keluar?',
        text: "Anda harus memasukkan PIN lagi nanti.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#fe7096',
        confirmButtonText: 'Ya, Keluar',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            $.get('api.php?action=logout', function () {
                sessionStorage.removeItem('isLoggedIn');
                $('#login-overlay').fadeIn();
                $('#pin-input').val('');
                closeSidebar();
            });
        }
    });
}

function updatePin() {
    const newPin = $('#new-pin').val();
    if (!newPin || newPin.length < 4) {
        return Swal.fire('Warning', 'PIN minimal 4 digit', 'warning');
    }
    $.post('api.php?action=update_settings', { pin: newPin }, function (res) {
        if (res.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: 'PIN Berhasil Diperbarui',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });
            $('#new-pin').val('');
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    }, 'json');
}

// --- Data Loading ---
function loadSummary() {
    $.get('api.php?action=get_summary', function (d) {
        $('#dash-income').text(formatIDR(d.income));
        $('#dash-expense').text(formatIDR(d.expense));
        $('#dash-balance').text(formatIDR(d.balance));
    }, 'json');
}

function loadQuickStats() {
    $.get('api.php?action=get_transactions', function (data) {
        if (!Array.isArray(data)) return;
        $('#stat-total').text(data.length + ' transaksi');

        // Hitung rasio pengeluaran
        const income = data.filter(t => t.type === 'income').reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const expense = data.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const ratio = income > 0 ? Math.round((expense / income) * 100) : 0;
        $('#stat-ratio').text(ratio + '%');
    }, 'json');

    $.get('api.php?action=get_savings', function (data) {
        if (!Array.isArray(data)) return;
        $('#stat-savings').text(data.length + ' target');
    }, 'json');
}

function loadTransactions() {
    $.get('api.php?action=get_transactions', function (data) {
        if (!Array.isArray(data)) return;

        // Dashboard Recent Table
        const dashTable = $('#dashboard-recent-table tbody');
        if (dashTable.length) {
            dashTable.empty();
            if (data.length === 0) {
                dashTable.append('<tr><td class="text-center text-muted p-3">Belum ada transaksi</td></tr>');
            } else {
                data.slice(0, 5).forEach(item => {
                    const isInc = item.type === 'income';
                    dashTable.append(`
                        <tr>
                            <td><small class="text-muted">${formatDateIndo(item.date)}</small></td>
                            <td><b>${item.category}</b></td>
                            <td class="text-end fw-bold ${isInc ? 'text-success' : 'text-danger'}">
                                ${isInc ? '+' : '-'} ${formatIDR(item.amount)}
                            </td>
                        </tr>
                    `);
                });
            }
        }

        // Main Transaction Table
        const mainTable = $('#main-transaction-table tbody');
        if (mainTable.length) {
            mainTable.empty();
            const start = (currentPage - 1) * rowsPerPage;
            const paginatedData = data.slice(start, start + rowsPerPage);
            
            if (paginatedData.length === 0) {
                mainTable.append('<tr><td colspan="5" class="text-center text-muted p-4">Belum ada data transaksi</td></tr>');
            } else {
                paginatedData.forEach(item => {
                    const isInc = item.type === 'income';
                    const safeDesc = (item.description || '').replace(/'/g, "\\'");
                    mainTable.append(`
                        <tr>
                            <td class="small fw-semibold">${formatDateIndo(item.date)}</td>
                            <td>
                                <span class="fw-bold">${item.category}</span><br>
                                <small class="text-muted">${item.description || '-'}</small>
                            </td>
                            <td>
                                <span class="badge ${isInc ? 'bg-success' : 'bg-danger'} px-3 py-2">
                                    ${isInc ? 'Masuk' : 'Keluar'}
                                </span>
                            </td>
                            <td class="text-end fw-bold ${isInc ? 'text-success' : 'text-danger'}">
                                ${formatIDR(item.amount)}
                            </td>
                            <td class="text-center">
                                <button class="btn btn-sm btn-info text-white shadow-sm me-1" 
                                    onclick="editTransaction(${item.id}, '${item.type}', '${item.category}', ${item.amount}, '${item.date}', '${safeDesc}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-danger shadow-sm" 
                                    onclick="deleteTransaction(${item.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `);
                });
            }
            renderPagination(Math.max(1, Math.ceil(data.length / rowsPerPage)));
        }
    }, 'json');
}

function renderPagination(totalPages) {
    const pagination = $('#transaction-pagination');
    pagination.empty();
    for (let i = 1; i <= totalPages; i++) {
        pagination.append(`
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="currentPage=${i}; loadTransactions();">${i}</a>
            </li>
        `);
    }
}

// --- Transaction CRUD ---
function openTransactionModal() {
    Swal.fire({
        title: 'Transaksi Baru',
        html: `
            <div class="text-start">
                <label class="small fw-bold">Tipe Transaksi</label>
                <select id="swal-type" class="swal2-input mt-1 w-100">
                    <option value="expense">Pengeluaran</option>
                    <option value="income">Pemasukan</option>
                </select>
                <label class="small fw-bold mt-3">Kategori</label>
                <input id="swal-cat" class="swal2-input mt-1 w-100" placeholder="Contoh: Makanan, Gaji, dll">
                <label class="small fw-bold mt-3">Jumlah (Rp)</label>
                <input id="swal-amt" type="number" class="swal2-input mt-1 w-100" placeholder="0">
                <label class="small fw-bold mt-3">Tanggal</label>
                <input id="swal-date" type="date" class="swal2-input mt-1 w-100" value="${new Date().toISOString().split('T')[0]}">
                <label class="small fw-bold mt-3">Catatan</label>
                <textarea id="swal-desc" class="swal2-textarea mt-1 w-100" placeholder="Catatan tambahan (opsional)"></textarea>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            const cat = $('#swal-cat').val();
            const amt = $('#swal-amt').val();
            if (!cat || !amt) {
                Swal.showValidationMessage('Kategori dan Jumlah wajib diisi');
                return false;
            }
            return {
                type: $('#swal-type').val(),
                category: cat,
                amount: amt,
                date: $('#swal-date').val(),
                description: $('#swal-desc').val()
            };
        }
    }).then(res => {
        if (res.isConfirmed) {
            $.post('api.php?action=add_transaction', res.value, () => {
                loadSummary();
                loadTransactions();
                loadQuickStats();
                Swal.fire({
                    icon: 'success',
                    title: 'Tersimpan',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 1500
                });
            });
        }
    });
}

function editTransaction(id, type, cat, amt, date, desc) {
    Swal.fire({
        title: 'Edit Transaksi',
        html: `
            <div class="text-start">
                <label class="small fw-bold">Tipe Transaksi</label>
                <select id="swal-type" class="swal2-input mt-1 w-100">
                    <option value="expense" ${type === 'expense' ? 'selected' : ''}>Pengeluaran</option>
                    <option value="income" ${type === 'income' ? 'selected' : ''}>Pemasukan</option>
                </select>
                <label class="small fw-bold mt-3">Kategori</label>
                <input id="swal-cat" class="swal2-input mt-1 w-100" value="${cat}">
                <label class="small fw-bold mt-3">Jumlah (Rp)</label>
                <input id="swal-amt" type="number" class="swal2-input mt-1 w-100" value="${amt}">
                <label class="small fw-bold mt-3">Tanggal</label>
                <input id="swal-date" type="date" class="swal2-input mt-1 w-100" value="${date}">
                <label class="small fw-bold mt-3">Catatan</label>
                <textarea id="swal-desc" class="swal2-textarea mt-1 w-100">${desc}</textarea>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Update',
        cancelButtonText: 'Batal',
        preConfirm: () => ({
            id: id,
            type: $('#swal-type').val(),
            category: $('#swal-cat').val(),
            amount: $('#swal-amt').val(),
            date: $('#swal-date').val(),
            description: $('#swal-desc').val()
        })
    }).then(res => {
        if (res.isConfirmed) {
            $.post('api.php?action=update_transaction', res.value, () => {
                loadSummary();
                loadTransactions();
                loadQuickStats();
            });
        }
    });
}

function deleteTransaction(id) {
    Swal.fire({
        title: 'Hapus Transaksi?',
        text: 'Data yang dihapus tidak dapat dikembalikan',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#fe7096',
        confirmButtonText: 'Hapus',
        cancelButtonText: 'Batal'
    }).then(res => {
        if (res.isConfirmed) {
            $.post('api.php?action=delete_transaction', { id: id }, () => {
                loadSummary();
                loadTransactions();
                loadQuickStats();
            });
        }
    });
}

// --- Savings CRUD ---
function loadSavings() {
    $.get('api.php?action=get_savings', function (data) {
        if (!Array.isArray(data)) return;
        
        let html = '';
        data.forEach(item => {
            html += `
                <div class="col-lg-4 col-md-6">
                    <div class="widget-card saving-card">
                        <div class="widget-header">
                            <h6 class="widget-title m-0">${item.goal_name}</h6>
                            <button class="btn btn-sm text-danger p-0" onclick="deleteSaving(${item.id})">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div class="widget-body">
                            <h3 class="text-primary fw-bold mb-2">${formatIDR(item.current_amount)}</h3>
                            <div class="progress mb-2" style="height: 8px;">
                                <div class="progress-bar bg-gradient" style="width: ${Math.min(item.percent, 100)}%"></div>
                            </div>
                            <div class="d-flex justify-content-between small text-muted">
                                <span>Target: ${formatIDR(item.target_amount)}</span>
                                <span class="fw-bold">${item.percent}%</span>
                            </div>
                            <button class="btn btn-gradient btn-sm mt-3 w-100" onclick="topupSaving(${item.id})">
                                <i class="fas fa-plus me-1"></i> Update Saldo
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        $('#savings-container').html(html || `
            <div class="col-12">
                <div class="widget-card">
                    <div class="widget-body text-center p-5">
                        <i class="fas fa-piggy-bank fa-3x text-muted mb-3"></i>
                        <p class="text-muted">Belum ada target tabungan. Buat target baru untuk mulai menabung!</p>
                    </div>
                </div>
            </div>
        `);
    }, 'json');
}

function openSavingModal() {
    Swal.fire({
        title: 'Target Tabungan Baru',
        html: `
            <div class="text-start">
                <label class="small fw-bold">Nama Target</label>
                <input id="save-name" class="swal2-input mt-1 w-100" placeholder="Contoh: Liburan, Dana Darurat">
                <label class="small fw-bold mt-3">Target (Rp)</label>
                <input id="save-target" type="number" class="swal2-input mt-1 w-100" placeholder="0">
                <label class="small fw-bold mt-3">Saldo Awal (Rp)</label>
                <input id="save-current" type="number" class="swal2-input mt-1 w-100" placeholder="0">
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        preConfirm: () => {
            const name = $('#save-name').val();
            const target = $('#save-target').val();
            if (!name || !target) {
                Swal.showValidationMessage('Nama dan Target wajib diisi');
                return false;
            }
            return {
                goal_name: name,
                target_amount: target,
                current_amount: $('#save-current').val() || 0
            };
        }
    }).then(res => {
        if (res.isConfirmed) {
            $.post('api.php?action=add_saving_goal', res.value, () => {
                loadSavings();
                loadQuickStats();
                Swal.fire({
                    icon: 'success',
                    title: 'Target Tersimpan',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 1500
                });
            });
        }
    });
}

function topupSaving(id) {
    Swal.fire({
        title: 'Update Saldo Tabungan',
        html: '<p class="small text-muted">Gunakan angka negatif (-) untuk menarik saldo</p>',
        input: 'number',
        inputPlaceholder: 'Jumlah (Rp)',
        showCancelButton: true,
        confirmButtonText: 'Update',
        cancelButtonText: 'Batal'
    }).then(res => {
        if (res.value) {
            $.post('api.php?action=update_saving_balance', { id: id, amount: res.value }, () => {
                loadSavings();
                loadQuickStats();
            });
        }
    });
}

function deleteSaving(id) {
    Swal.fire({
        title: 'Hapus Target Tabungan?',
        text: 'Data yang dihapus tidak dapat dikembalikan',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#fe7096',
        confirmButtonText: 'Hapus',
        cancelButtonText: 'Batal'
    }).then(res => {
        if (res.isConfirmed) {
            $.post('api.php?action=delete_saving', { id: id }, () => {
                loadSavings();
                loadQuickStats();
            });
        }
    });
}

// --- Utilities ---
function formatIDR(v) {
    return 'Rp ' + parseInt(v || 0).toLocaleString('id-ID');
}

function formatDateIndo(dateStr) {
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

    const d = new Date(dateStr);
    const dayName = days[d.getDay()];
    const date = String(d.getDate()).padStart(2, '0');
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();

    return `${dayName}, ${date} ${monthName} ${year}`;
}

function toggleTheme() {
    $('body').toggleClass('dark-mode');
    const isDark = $('body').hasClass('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}
