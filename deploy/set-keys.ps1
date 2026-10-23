# Вписывает ключи V5Pay на VPS. Ключи вводятся здесь, в окне PowerShell, и уходят
# прямо на сервер по SSH — в чат, в git и в историю команд они не попадают.
# Подсказки на английском: Windows PowerShell 5.1 искажает кириллицу из файла без BOM.
#
#   powershell -ExecutionPolicy Bypass -File deploy\set-keys.ps1 -Server <IP сервера>
param(
    [Parameter(Mandatory = $true)] [string]$Server,
    [string]$KeyFile = "$env:USERPROFILE\.ssh\v5pay_vps"
)

function Read-Required([string]$Prompt) {
    do { $value = (Read-Host $Prompt).Trim() } while (-not $value)
    return $value
}

$baseUrl = (Read-Host 'V5PAY_BASE_URL (Enter = test https://api-uat.v5pay.com)').Trim()
if (-not $baseUrl) { $baseUrl = 'https://api-uat.v5pay.com' }
$merchant = Read-Required 'V5PAY_MERCHANT_NO'
$appKey = Read-Required 'V5PAY_APP_KEY'
do {
    $secure = Read-Host 'V5PAY_SECRET_KEY (input is hidden)' -AsSecureString
} while ($secure.Length -eq 0)
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    $OutputEncoding = New-Object System.Text.UTF8Encoding $false  # без BOM
    "$baseUrl`n$merchant`n$appKey`n$($secret.Trim())`n" | ssh -i $KeyFile "root@$Server" 'bash /opt/v5pay/deploy/set-keys.sh'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
