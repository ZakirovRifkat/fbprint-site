<?php
/* Настройки почты для send.php. На хостинге скопируйте этот файл в config.php
   рядом с send.php и впишите пароль. config.php не хранится в git. */

return [
    'smtp_host'   => 'mail.hosting.reg.ru',
    'smtp_port'   => 465,
    'smtp_secure' => 'ssl',                 // 'ssl' для порта 465, 'tls' для 587
    'smtp_user'   => 'site@fb-print.ru',    // отдельный ящик на тарифе Mail-1, от него уходят заявки
    'smtp_pass'   => '[ПАРОЛЬ ЯЩИКА]',
    'from'        => 'site@fb-print.ru',
    'to'          => 'info@fb-print.ru',    // куда приходят заявки
];
