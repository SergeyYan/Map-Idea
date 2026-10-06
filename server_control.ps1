Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "SilentlyContinue"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ApiUrl = "http://127.0.0.1:8000"

$script:LastServerState = $null
$script:WaitingForStart = $false
$script:StartDeadline = $null


function Add-Log {
    param([string]$Text)

    $time = Get-Date -Format "HH:mm:ss"
    $logBox.AppendText("[$time] $Text`r`n")
    $logBox.SelectionStart = $logBox.TextLength
    $logBox.ScrollToCaret()
}


function Test-Server {
    try {
        $request = [System.Net.HttpWebRequest]::Create($ApiUrl)
        $request.Method = "GET"
        $request.Timeout = 800
        $request.ReadWriteTimeout = 800

        $response = $request.GetResponse()
        $response.Close()

        return $true
    }
    catch {
        # Даже HTTP 404/405 означает, что сервер реально отвечает.
        if ($_.Exception.Response) {
            try {
                $_.Exception.Response.Close()
            }
            catch {}

            return $true
        }

        return $false
    }
}


function Set-ServerUi {
    param([bool]$Running)

    if ($Running) {
        $statusLabel.Text = "● Сервер запущен"
        $statusLabel.BackColor = [System.Drawing.Color]::FromArgb(212,237,218)
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(21,87,36)

        $startButton.Enabled = $false
        $stopButton.Enabled = $true
    }
    else {
        $statusLabel.Text = "○ Сервер остановлен"
        $statusLabel.BackColor = [System.Drawing.Color]::FromArgb(248,215,218)
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(114,28,36)

        $startButton.Enabled = $true
        $stopButton.Enabled = $false
    }
}


function Update-Status {
    param(
        [bool]$ManualLog = $false
    )

    $running = Test-Server
    Set-ServerUi -Running $running

    # Реальное изменение состояния: пишем один раз.
    if ($script:LastServerState -ne $null -and $running -ne $script:LastServerState) {

        if ($running) {
            Add-Log "Сервер успешно запущен"
            $script:WaitingForStart = $false
            $script:StartDeadline = $null
        }
        else {
            Add-Log "Сервер остановлен"

            # Если сервер остановился, ожидание старта больше не должно жить.
            $script:WaitingForStart = $false
            $script:StartDeadline = $null
        }
    }
    elseif ($ManualLog) {
        if ($running) {
            Add-Log "Сервер отвечает на $ApiUrl"
        }
        else {
            Add-Log "Сервер остановлен"
        }
    }

    # Если ждём запуск — проверяем дедлайн.
    if ($script:WaitingForStart) {

        if ($running) {
            $script:WaitingForStart = $false
            $script:StartDeadline = $null

            # Если стартовали из состояния, когда LastServerState ещё был $null.
            if ($script:LastServerState -eq $null) {
                Add-Log "Сервер успешно запущен"
            }
        }
        elseif ($script:StartDeadline -ne $null -and (Get-Date) -ge $script:StartDeadline) {
            Add-Log "Сервер не запустился за 20 секунд"
            $script:WaitingForStart = $false
            $script:StartDeadline = $null
        }
    }

    $script:LastServerState = $running
    return $running
}


function Run-Bat {
    param(
        [Parameter(Mandatory=$true)]
        [string]$FileName,

        [bool]$Wait = $false
    )

    $batPath = Join-Path $BaseDir $FileName

    if (-not (Test-Path -LiteralPath $batPath)) {
        throw "Файл не найден: $batPath"
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $env:ComSpec
    $psi.Arguments = "/d /s /c `"`"$batPath`"`""
    $psi.WorkingDirectory = $BaseDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi

    if (-not $process.Start()) {
        throw "Не удалось запустить $FileName"
    }

    if ($Wait) {
        $process.WaitForExit()
        return $process.ExitCode
    }

    return 0
}


# ------------------------------------------------------------
# UI
# ------------------------------------------------------------

$form = New-Object System.Windows.Forms.Form
$form.Text = "IdeaMap Server"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(540,570)
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI",11)


$title = New-Object System.Windows.Forms.Label
$title.Text = "🌐 IdeaMap Server"
$title.Font = New-Object System.Drawing.Font(
    "Segoe UI",
    22,
    [System.Drawing.FontStyle]::Bold
)
$title.TextAlign = "MiddleCenter"
$title.SetBounds(35,15,470,48)
$form.Controls.Add($title)


$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Проверка статуса..."
$statusLabel.Font = New-Object System.Drawing.Font(
    "Segoe UI",
    13,
    [System.Drawing.FontStyle]::Bold
)
$statusLabel.TextAlign = "MiddleCenter"
$statusLabel.SetBounds(35,75,470,55)
$form.Controls.Add($statusLabel)


$startButton = New-Object System.Windows.Forms.Button
$startButton.Text = "▶ Запустить"
$startButton.Font = New-Object System.Drawing.Font(
    "Segoe UI",
    12,
    [System.Drawing.FontStyle]::Bold
)
$startButton.BackColor = [System.Drawing.Color]::FromArgb(40,167,69)
$startButton.ForeColor = [System.Drawing.Color]::White
$startButton.FlatStyle = "Flat"
$startButton.SetBounds(145,150,250,58)
$form.Controls.Add($startButton)


$stopButton = New-Object System.Windows.Forms.Button
$stopButton.Text = "■ Остановить"
$stopButton.Font = New-Object System.Drawing.Font(
    "Segoe UI",
    12,
    [System.Drawing.FontStyle]::Bold
)
$stopButton.BackColor = [System.Drawing.Color]::FromArgb(220,53,69)
$stopButton.ForeColor = [System.Drawing.Color]::White
$stopButton.FlatStyle = "Flat"
$stopButton.SetBounds(145,220,250,58)
$form.Controls.Add($stopButton)


$openButton = New-Object System.Windows.Forms.Button
$openButton.Text = "🌐 Открыть в браузере"
$openButton.Font = New-Object System.Drawing.Font(
    "Segoe UI",
    12,
    [System.Drawing.FontStyle]::Bold
)
$openButton.BackColor = [System.Drawing.Color]::FromArgb(0,123,255)
$openButton.ForeColor = [System.Drawing.Color]::White
$openButton.FlatStyle = "Flat"
$openButton.SetBounds(90,290,360,58)
$form.Controls.Add($openButton)


$refreshButton = New-Object System.Windows.Forms.Button
$refreshButton.Text = "⟳ Обновить"
$refreshButton.Font = New-Object System.Drawing.Font(
    "Segoe UI",
    12,
    [System.Drawing.FontStyle]::Bold
)
$refreshButton.BackColor = [System.Drawing.Color]::FromArgb(108,117,125)
$refreshButton.ForeColor = [System.Drawing.Color]::White
$refreshButton.FlatStyle = "Flat"
$refreshButton.SetBounds(145,360,250,58)
$form.Controls.Add($refreshButton)


$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = "Vertical"
$logBox.Font = New-Object System.Drawing.Font("Consolas",9)
$logBox.BackColor = [System.Drawing.Color]::FromArgb(248,249,250)
$logBox.SetBounds(35,440,470,105)
$form.Controls.Add($logBox)


# ------------------------------------------------------------
# Кнопка START
# ------------------------------------------------------------

$startButton.Add_Click({

    if (Test-Server) {
        Add-Log "Сервер уже запущен"
        Update-Status | Out-Null
        return
    }

    Add-Log "Запуск сервера..."

    try {
        Run-Bat -FileName "start_server.bat" -Wait $false | Out-Null
        Add-Log "start_server.bat запущен"

        # Один флаг ожидания вместо отдельного Timer.
        $script:WaitingForStart = $true
        $script:StartDeadline = (Get-Date).AddSeconds(20)

        $startButton.Enabled = $false
    }
    catch {
        $script:WaitingForStart = $false
        $script:StartDeadline = $null

        Add-Log ("Ошибка запуска: " + $_.Exception.Message)

        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            "Ошибка"
        )
    }
})


# ------------------------------------------------------------
# Кнопка STOP
# ------------------------------------------------------------

$stopButton.Add_Click({

    # Критично: сразу отменяем любое ожидание старта.
    $script:WaitingForStart = $false
    $script:StartDeadline = $null

    Add-Log "Остановка сервера..."

    try {
        $code = Run-Bat -FileName "stop_server.bat" -Wait $true

        Add-Log "stop_server.bat завершён. Код: $code"

        Start-Sleep -Milliseconds 400

        $running = Test-Server

        if ($running) {
            Add-Log "Сервер всё ещё отвечает"
        }
        else {
            Set-ServerUi -Running $false

            # Чтобы общий таймер не написал ту же остановку второй раз.
            $script:LastServerState = $false

            Add-Log "Сервер успешно остановлен"
        }
    }
    catch {
        Add-Log ("Ошибка остановки: " + $_.Exception.Message)

        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            "Ошибка"
        )
    }
})


# ------------------------------------------------------------
# Остальные кнопки
# ------------------------------------------------------------

$openButton.Add_Click({
    try {
        Start-Process $ApiUrl
        Add-Log "Сервер открыт в браузере"
    }
    catch {
        Add-Log ("Ошибка открытия браузера: " + $_.Exception.Message)
    }
})


$refreshButton.Add_Click({
    Update-Status -ManualLog $true | Out-Null
})


# ------------------------------------------------------------
# Один общий таймер для всего приложения
# ------------------------------------------------------------

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000

$timer.Add_Tick({
    Update-Status | Out-Null
})

$timer.Start()


$form.Add_Shown({

    Add-Log "Папка: $BaseDir"

    $initialState = Test-Server
    Set-ServerUi -Running $initialState

    $script:LastServerState = $initialState
})


$form.Add_FormClosed({
    $timer.Stop()
    $timer.Dispose()
})


[void]$form.ShowDialog()
