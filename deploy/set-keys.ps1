# Вписывает ключи V5Pay на VPS. Ключи вводятся здесь, в окне PowerShell, и уходят
# прямо на сервер по SSH — в чат, в git и в историю команд они не попадают.
#
#   powershell -ExecutionPolicy Bypass -File deploy\set-keys.ps1 -Server <IP сервера>
param(
    [Parameter(Mandatory = $true)] [string]$Server,
    [string]$KeyFile = "$env:USERPROFILE\.ssh\v5pay_vps"
)

$baseUrl = Read-Host 'V5PAY_BASE_URL (Enter = тестовый https://api-uat.v5pay.com)'
if (-not $baseUrl) { $baseUrl = 'https://api-uat.v5pay.com' }
$merchant = Read-Host 'V5PAY_MERCHANT_NO'
$appKey = Read-Host 'V5PAY_APP_KEY'
$secure = Read-Host 'V5PAY_SECRET_KEY (символы не отображаются)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    $OutputEncoding = New-Object System.Text.UTF8Encoding $false  # без BOM
    "$baseUrl`n$merchant`n$appKey`n$($secret.Trim())`n" | ssh -i $KeyFile "root@$Server" 'bash /opt/v5pay/deploy/set-keys.sh'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
