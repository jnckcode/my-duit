<?php
/**
 * My Duit API - Revisi dengan Session Management yang Konsisten
 * Session akan hilang ketika browser ditutup
 */

// Konfigurasi Session untuk konsistensi
ini_set('session.cookie_lifetime', 0); // Cookie hilang saat browser tutup
ini_set('session.gc_maxlifetime', 86400); // Session expired dalam 24 jam jika jalan terus
ini_set('session.use_strict_mode', 1); // Mode strict untuk keamanan
ini_set('session.cookie_httponly', 1); // Lindungi dari JavaScript
ini_set('session.use_only_cookies', 1); // Hanya gunakan cookies

session_start();

// Header untuk mencegah caching
header('Content-Type: application/json; charset=utf-8');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");
header("Expires: 0");

date_default_timezone_set('Asia/Jakarta');

// --- 1. KONEKSI & INIT DATABASE ---
try {
    $db = new SQLite3('data.db');
    $db->exec('PRAGMA journal_mode = WAL;');
    
    $db->exec("
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT, 
            category TEXT,
            amount REAL,
            description TEXT,
            date DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS savings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_name TEXT,
            target_amount REAL,
            current_amount REAL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    ");
    
    // PIN Default
    $checkPin = $db->querySingle("SELECT value FROM settings WHERE key='app_pin'");
    if (!$checkPin) {
        $db->exec("INSERT INTO settings (key, value) VALUES ('app_pin', '1234')");
    }
} catch (Exception $e) {
    die(json_encode(['status' => 'error', 'message' => $e->getMessage()]));
}

$action = $_GET['action'] ?? '';

// --- 2. AUTHENTICATION ---

if ($action == 'login') {
    $inputPin = $_POST['pin'] ?? '';
    $realPin = $db->querySingle("SELECT value FROM settings WHERE key='app_pin'");
    
    if ($inputPin !== '' && $inputPin == $realPin) {
        // Regenerate session ID untuk keamanan
        session_regenerate_id(true);
        $_SESSION['is_logged_in'] = true;
        $_SESSION['login_time'] = time();
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'PIN salah']);
    }
    exit; 
}

if ($action == 'logout') {
    // Hapus semua data session
    $_SESSION = array();
    
    // Hapus session cookie
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    
    // Hancurkan session
    session_destroy();
    
    echo json_encode(['status' => 'success']);
    exit;
}

// Cek status login
if ($action == 'check_auth') {
    if (isset($_SESSION['is_logged_in']) && $_SESSION['is_logged_in'] === true) {
        echo json_encode(['status' => 'logged_in']);
    } else {
        echo json_encode(['status' => 'not_logged_in']);
    }
    exit;
}

// PROTEKSI SESI - Semua aksi di bawah ini memerlukan login
if (!isset($_SESSION['is_logged_in']) || $_SESSION['is_logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit;
}

// --- 3. TRANSAKSI ---

if ($action == 'get_summary') {
    $currentMonth = date('Y-m');
    
    // Total income bulan ini
    $income = $db->querySingle("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='income' AND strftime('%Y-%m', date) = '$currentMonth'");
    
    // Total expense bulan ini
    $expense = $db->querySingle("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='expense' AND strftime('%Y-%m', date) = '$currentMonth'");
    
    // Total saldo (keseluruhan, bukan hanya bulan ini)
    $totalIncome = $db->querySingle("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='income'") ?: 0;
    $totalExpense = $db->querySingle("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='expense'") ?: 0;
    $balance = $totalIncome - $totalExpense;
    
    echo json_encode([
        'income' => $income, 
        'expense' => $expense, 
        'balance' => $balance
    ]);
    exit;
}

if ($action == 'get_transactions') {
    $res = $db->query("SELECT * FROM transactions ORDER BY date DESC, id DESC");
    $data = [];
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) { 
        $data[] = $row; 
    }
    echo json_encode($data);
    exit;
}

if ($action == 'add_transaction') {
    $stmt = $db->prepare("INSERT INTO transactions (type, category, amount, description, date) VALUES (:t, :c, :a, :d, :dt)");
    $stmt->bindValue(':t', $_POST['type']);
    $stmt->bindValue(':c', $_POST['category']);
    $stmt->bindValue(':a', floatval($_POST['amount']));
    $stmt->bindValue(':d', $_POST['description'] ?? '');
    $stmt->bindValue(':dt', $_POST['date']);
    $stmt->execute();
    echo json_encode(['status' => 'success', 'id' => $db->lastInsertRowID()]);
    exit;
}

if ($action == 'update_transaction') {
    $stmt = $db->prepare("UPDATE transactions SET type=:t, category=:c, amount=:a, description=:d, date=:dt WHERE id=:id");
    $stmt->bindValue(':id', intval($_POST['id']));
    $stmt->bindValue(':t', $_POST['type']);
    $stmt->bindValue(':c', $_POST['category']);
    $stmt->bindValue(':a', floatval($_POST['amount']));
    $stmt->bindValue(':d', $_POST['description'] ?? '');
    $stmt->bindValue(':dt', $_POST['date']);
    $stmt->execute();
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action == 'delete_transaction') {
    $stmt = $db->prepare("DELETE FROM transactions WHERE id = :id");
    $stmt->bindValue(':id', intval($_POST['id']));
    $stmt->execute();
    echo json_encode(['status' => 'success']);
    exit;
}

// --- 4. SAVINGS ---

if ($action == 'get_savings') {
    $res = $db->query("SELECT * FROM savings ORDER BY id DESC");
    $data = [];
    while ($row = $res->fetchArray(SQLITE3_ASSOC)) { 
        $percent = ($row['target_amount'] > 0) ? ($row['current_amount'] / $row['target_amount']) * 100 : 0;
        $row['percent'] = round($percent, 1);
        $data[] = $row; 
    }
    echo json_encode($data);
    exit;
}

if ($action == 'add_saving_goal') {
    $stmt = $db->prepare("INSERT INTO savings (goal_name, target_amount, current_amount) VALUES (:n, :t, :c)");
    $stmt->bindValue(':n', $_POST['goal_name']);
    $stmt->bindValue(':t', floatval($_POST['target_amount']));
    $stmt->bindValue(':c', floatval($_POST['current_amount'] ?? 0));
    $stmt->execute();
    echo json_encode(['status' => 'success', 'id' => $db->lastInsertRowID()]);
    exit;
}

if ($action == 'update_saving_balance') {
    $stmt = $db->prepare("UPDATE savings SET current_amount = current_amount + :amt WHERE id = :id");
    $stmt->bindValue(':amt', floatval($_POST['amount']));
    $stmt->bindValue(':id', intval($_POST['id']));
    $stmt->execute();
    echo json_encode(['status' => 'success']);
    exit;
}

if ($action == 'delete_saving') {
    $stmt = $db->prepare("DELETE FROM savings WHERE id = :id");
    $stmt->bindValue(':id', intval($_POST['id']));
    $stmt->execute();
    echo json_encode(['status' => 'success']);
    exit;
}

// --- 5. SETTINGS ---

if ($action == 'update_settings') {
    $pin = $_POST['pin'] ?? '';
    if (!empty($pin)) {
        $stmt = $db->prepare("UPDATE settings SET value = :v WHERE key = 'app_pin'");
        $stmt->bindValue(':v', $pin);
        $stmt->execute();
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'PIN kosong']);
    }
    exit;
}

// Default response jika action tidak dikenal
echo json_encode(['status' => 'error', 'message' => 'Unknown action']);
?>
