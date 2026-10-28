<?php
/* Заявка на расчёт: проверяет поля и отправляет письмо с макетами
   через SMTP почтового ящика на reg.ru.
   Файлы не сохраняются на сервере: вложения читаются из временных копий,
   которые PHP удаляет сам после ответа. Данные заявки не пишутся в журналы. */

declare(strict_types=1);

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;  // в base64 письмо вырастет до ~40 МБ, лимит почты reg.ru — 50 МБ
const ALLOWED_EXT = ['pdf', 'ai', 'eps', 'cdr', 'svg', 'tif', 'tiff', 'psd', 'jpg', 'jpeg', 'png', 'zip', 'rar'];
const PRODUCTS = ['Продукты питания', 'Одежда и аксессуары', 'Акции и ивенты', 'Специальные свойства', 'Другое'];
const MATERIALS = ['Бумага', 'Плёнка', 'Специальный', 'Нужна консультация'];
const FAIL = 'Не получилось отправить заявку. Попробуйте ещё раз или напишите на info@fb-print.ru.';
const CONSENT_EDITION = '13.10.2026';  // дата редакции на consent.html: менять вместе с ней

date_default_timezone_set('Europe/Moscow');
mb_internal_encoding('UTF-8');

/* Ответ скрипту формы — JSON, браузеру без скрипта — короткая страница */
function respond(int $status, string $message): void
{
    http_response_code($status);
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    if (strpos($accept, 'application/json') !== false) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $status < 400, 'message' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $title = $status < 400 ? 'Заявка отправлена' : 'Заявка не отправлена';
    $text = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>' . $title . ' — FB-print</title>'
        . '<link rel="stylesheet" href="style.css"></head><body>'
        . '<main class="doc"><div class="shell doc__shell"><h1 class="doc__title">' . $title . '</h1>'
        . '<p class="doc__meta">' . $text . '</p>'
        . '<p class="doc__meta"><a class="link-underline" href="./">Вернуться на сайт</a></p>'
        . '</div></main></body></html>';
    exit;
}

/* Поле формы: строка без управляющих символов и не длиннее $max */
function field(string $key, int $max, bool $multiline = false): string
{
    $value = $_POST[$key] ?? '';
    if (!is_string($value)) {
        return '';
    }
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);
    if ($value === null) {
        return '';  // не UTF-8
    }
    $value = $multiline
        ? preg_replace("/\r\n|\r|\n/", "\r\n", $value)
        : preg_replace('/\s+/u', ' ', $value);
    return mb_substr(trim((string) $value), 0, $max);
}

function clean_filename(string $name): string
{
    $name = preg_replace('/[\x00-\x1F\x7F"\\\\\/]/u', '_', $name);
    $name = trim((string) $name);
    return $name === '' ? 'file' : mb_substr($name, -100);  // хвост, чтобы не потерять расширение
}

function mime_header(string $text): string
{
    return mb_encode_mimeheader($text, 'UTF-8', 'B', "\r\n");
}

/* Минимальный SMTP-клиент: SSL (465) или STARTTLS (587), AUTH LOGIN */
final class Smtp
{
    /** @var resource */
    private $socket;

    public function __construct(array $config)
    {
        $host = (string) $config['smtp_host'];
        $port = (int) $config['smtp_port'];
        $secure = (string) ($config['smtp_secure'] ?? 'ssl');
        $context = stream_context_create(['ssl' => ['peer_name' => $host]]);
        $socket = @stream_socket_client(
            ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port,
            $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $context
        );
        if ($socket === false) {
            throw new RuntimeException("SMTP: нет соединения с $host:$port ($errstr)");
        }
        $this->socket = $socket;
        stream_set_timeout($socket, 60);

        $helo = $_SERVER['SERVER_NAME'] ?? 'localhost';
        $this->expect(220);
        $this->command("EHLO $helo", 250);
        if ($secure === 'tls') {
            $this->command('STARTTLS', 220);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('SMTP: не удалось включить TLS');
            }
            $this->command("EHLO $helo", 250);
        }
        $this->command('AUTH LOGIN', 334);
        $this->command(base64_encode((string) $config['smtp_user']), 334);
        $this->command(base64_encode((string) $config['smtp_pass']), 235);
    }

    /* $writeData пишет письмо целиком, последняя строка заканчивается на \r\n */
    public function send(string $from, string $to, callable $writeData): void
    {
        $this->command("MAIL FROM:<$from>", 250);
        $this->command("RCPT TO:<$to>", 250, 251);
        $this->command('DATA', 354);
        $writeData($this);
        $this->command('.', 250);
        try {
            $this->command('QUIT', 221);
        } catch (RuntimeException $e) {
            // письмо уже принято, ответ на QUIT не важен
        }
        fclose($this->socket);
    }

    public function write(string $data): void
    {
        $length = strlen($data);
        for ($done = 0; $done < $length; $done += $written) {
            $written = fwrite($this->socket, substr($data, $done, 8192));
            if ($written === false || $written === 0) {
                throw new RuntimeException('SMTP: соединение оборвалось');
            }
        }
    }

    private function command(string $line, int ...$codes): void
    {
        $this->write($line . "\r\n");
        $this->expect(...$codes);
    }

    private function expect(int ...$codes): void
    {
        $reply = '';
        while (($line = fgets($this->socket, 2048)) !== false) {
            $reply .= $line;
            if (!isset($line[3]) || $line[3] !== '-') {
                break;  // последняя строка ответа: «250 ...», а не «250-...»
            }
        }
        if (!in_array((int) substr($reply, 0, 3), $codes, true)) {
            throw new RuntimeException('SMTP: ' . trim($reply));
        }
    }
}

/* ---------- Проверка заявки ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, 'Заявку можно отправить только через форму на сайте.');
}

// Запрос больше post_max_size: PHP отбрасывает все поля и файлы
if (empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    respond(413, 'Файлы слишком большие. Пришлите их на info@fb-print.ru или ссылкой в комментарии.');
}

// Поле-ловушка скрыто от людей: заполнил — значит, бот. Отвечаем как обычно, но не отправляем
if (field('website', 200) !== '') {
    respond(200, 'Спасибо! Менеджер свяжется с вами и пришлёт расчёт.');
}

$name = field('name', 100);
$contact = field('contact', 150);
$company = field('company', 150);
$product = field('product', 100);
$material = field('material', 100);
$run = field('run', 100);
$comment = field('comment', 3000, true);

if ($name === '' || $contact === '') {
    respond(422, 'Укажите имя и телефон или e-mail.');
}
if (($_POST['consent'] ?? '') !== 'yes') {
    respond(422, 'Без согласия на обработку персональных данных заявку отправить нельзя.');
}
if (!in_array($product, PRODUCTS, true)) {
    $product = '';
}
if (!in_array($material, MATERIALS, true)) {
    $material = '';
}

$files = [];
$total = 0;
$upload = $_FILES['layout'] ?? null;
if (is_array($upload) && is_array($upload['name'] ?? null)) {
    foreach ($upload['name'] as $i => $original) {
        $error = (int) $upload['error'][$i];
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            respond(413, 'Файлы слишком большие. Пришлите их на info@fb-print.ru или ссылкой в комментарии.');
        }
        if ($error !== UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'][$i])) {
            respond(400, 'Не удалось загрузить файл. Попробуйте ещё раз или пришлите его на info@fb-print.ru.');
        }
        $filename = clean_filename((string) $original);
        $dot = strrpos($filename, '.');
        $ext = $dot === false ? '' : strtolower(substr($filename, $dot + 1));
        if (!in_array($ext, ALLOWED_EXT, true)) {
            respond(415, "Файл «{$filename}» в неподходящем формате. Подходят PDF, AI, EPS, CDR, SVG, TIFF, PSD, JPG, PNG, ZIP и RAR.");
        }
        $total += (int) $upload['size'][$i];
        $files[] = ['path' => $upload['tmp_name'][$i], 'name' => $filename];
    }
}
if (count($files) > MAX_FILES) {
    respond(413, 'Можно приложить не больше 10 файлов. Остальные упакуйте в архив или пришлите на info@fb-print.ru.');
}
if ($total > MAX_TOTAL_BYTES) {
    respond(413, 'Файлы больше 30 МБ. Пришлите их на info@fb-print.ru или ссылкой в комментарии.');
}

/* ---------- Письмо ---------- */

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    error_log('send.php: нет config.php с настройками почты');
    respond(500, FAIL);
}
$config = require $configFile;

$lines = ['Заявка на расчёт с сайта fb-print.ru', '', 'Имя: ' . $name, 'Контакт: ' . $contact];
if ($company !== '') {
    $lines[] = 'Компания: ' . $company;
}
if ($product !== '') {
    $lines[] = 'Что маркируем: ' . $product;
}
if ($material !== '') {
    $lines[] = 'Материал: ' . $material;
}
if ($run !== '') {
    $lines[] = 'Тираж: ' . $run;
}
if ($comment !== '') {
    array_push($lines, '', 'Комментарий:', $comment);
}
$lines[] = '';
$lines[] = $files ? 'Файлов во вложении: ' . count($files) : 'Файлов нет.';
$lines[] = 'Согласие на обработку персональных данных (редакция от ' . CONSENT_EDITION . ') дано '
    . date('d.m.Y в H:i') . ' (МСК).';

$subject = 'Заявка на расчёт: ' . $name . ($company !== '' ? ', ' . $company : '');
$replyTo = filter_var($contact, FILTER_VALIDATE_EMAIL) ?: '';
$from = (string) $config['from'];
$boundary = 'fbprint-' . bin2hex(random_bytes(12));

$head = [
    'Date: ' . date('r'),
    'From: ' . mime_header('Сайт FB-print') . ' <' . $from . '>',
    'To: <' . $config['to'] . '>',
    'Subject: ' . mime_header($subject),
    'Message-ID: <' . bin2hex(random_bytes(16)) . strrchr($from, '@') . '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
];
if ($replyTo !== '') {
    $head[] = 'Reply-To: <' . $replyTo . '>';  // ответ менеджера уйдёт сразу клиенту
}

/* Текст и вложения в base64: ни одна строка письма не начинается с точки,
   поэтому SMTP-экранирование точек не нужно */
$writeMessage = function (Smtp $smtp) use ($head, $lines, $files, $boundary): void {
    $smtp->write(implode("\r\n", $head) . "\r\n\r\n"
        . "--$boundary\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode(implode("\r\n", $lines)), 76, "\r\n"));

    foreach ($files as $file) {
        $encoded = '=?UTF-8?B?' . base64_encode($file['name']) . '?=';
        $smtp->write("--$boundary\r\n"
            . 'Content-Type: application/octet-stream; name="' . $encoded . "\"\r\n"
            . "Content-Transfer-Encoding: base64\r\n"
            . 'Content-Disposition: attachment; filename="' . $encoded . "\"\r\n\r\n");

        // Читаем по частям, кратным 57 байтам: каждая даёт целые строки base64 по 76 знаков
        $handle = fopen($file['path'], 'rb');
        if ($handle === false) {
            throw new RuntimeException('send.php: не открылся временный файл');
        }
        $buffer = '';
        while (!feof($handle)) {
            $buffer .= (string) fread($handle, 57 * 1024);
            $take = strlen($buffer) - strlen($buffer) % 57;
            if ($take > 0) {
                $smtp->write(chunk_split(base64_encode(substr($buffer, 0, $take)), 76, "\r\n"));
                $buffer = (string) substr($buffer, $take);
            }
        }
        fclose($handle);
        if ($buffer !== '') {
            $smtp->write(chunk_split(base64_encode($buffer), 76, "\r\n"));
        }
    }

    $smtp->write("--$boundary--\r\n");
};

@set_time_limit(120);

try {
    (new Smtp($config))->send($from, (string) $config['to'], $writeMessage);
} catch (Throwable $e) {
    error_log('send.php: ' . $e->getMessage());
    respond(502, FAIL);
}

respond(200, 'Спасибо! Менеджер свяжется с вами и пришлёт расчёт.');
