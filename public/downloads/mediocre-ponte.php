<?php
// Better Mangá — ponte MediocreScan. Envie para o seu cPanel e cole a senha gerada no painel abaixo.
$SENHA_DA_PONTE = 'COLE_A_SENHA_AQUI';

header('X-Relay: ok');
$key = $_SERVER['HTTP_X_RELAY_KEY'] ?? '';
if ($_SERVER['REQUEST_METHOD'] !== 'GET' || strlen($SENHA_DA_PONTE) < 32 || !hash_equals($SENHA_DA_PONTE, $key)) {
  header('X-Relay: denied', true, 401); exit('negado');
}
$hosts = ['api' => 'https://api.mediocretoons.net', 'api2' => 'https://back2.mediocrescan.com', 'cdn' => 'https://cdn.mediocrescan.com'];
$host = $_GET['host'] ?? '';
$path = $_GET['path'] ?? '';
if (!isset($hosts[$host]) || !preg_match('#^/[A-Za-z0-9/_.\-?=&%+]*$#', $path) || strpos($path, '..') !== false || strpos($path, '//') !== false) {
  header('X-Relay: denied', true, 401); exit('caminho negado');
}
$headers = ['Accept: application/json', 'User-Agent: Mozilla/5.0'];
if ($host !== 'cdn' && !empty($_SERVER['HTTP_X_MEDIOCRE_AUTH'])) $headers[] = 'Authorization: ' . $_SERVER['HTTP_X_MEDIOCRE_AUTH'];
$ch = curl_init($hosts[$host] . $path);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 15,
  CURLOPT_HTTPHEADER => $headers, CURLOPT_MAXFILESIZE => 8000000]);
$body = curl_exec($ch);
if ($body === false) { header('X-Relay: error', true, 502); exit('falha'); }
$code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/json';
curl_close($ch);
http_response_code($code);
header('Content-Type: ' . $type);
echo $body;
