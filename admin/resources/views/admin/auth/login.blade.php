<!DOCTYPE html>
<html>
<head>
    <title>Admin Login</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(120deg, #e0e7ff 0%, #f4f4f4 100%);
            min-height: 100vh;
        }
        .container {
            width: 350px;
            margin: 0 auto;
            margin-top: 90px;
            padding: 32px 28px 24px 28px;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        h1 {
            text-align: center;
            margin-bottom: 18px;
            font-weight: 600;
            color: #22223b;
            letter-spacing: 1px;
        }
        .input-group {
            position: relative;
            width: 100%;
            margin-bottom: 18px;
        }
        .input-group input {
            width: auto !important;
            padding: 12px 40px 12px 40px;
            border: 1.5px solid #c7d2fe;
            border-radius: 6px;
            font-size: 1rem;
            background: #f8fafc;
            transition: border 0.2s;
        }
        .input-group input:focus {
            border: 1.5px solid #6366f1;
            outline: none;
            background: #fff;
        }
        .input-group .icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: #6366f1;
            font-size: 1.1rem;
        }
        .input-group .toggle-password {
    position: absolute;
    right: -118px;
    top: 50%;
    transform: translateY(-56%);
    background: none;
    border: none;
    cursor: pointer;
    color: #6366f1;
    font-size: 1.1rem;
}
        button {
            width: 100%;
            padding: 12px;
            background: linear-gradient(90deg, #6366f1 0%, #4f46e5 100%);
            color: #fff;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 6px;
        }
        button:hover {
            background: linear-gradient(90deg, #4f46e5 0%, #6366f1 100%);
        }
        .error {
            color: #ef4444;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 5px;
            padding: 8px 12px;
            margin-bottom: 16px;
            width: 100%;
            text-align: center;
            font-size: 0.97rem;
        }
        @media (max-width: 480px) {
            .container {
                width: 95vw;
                padding: 18px 6vw 18px 6vw;
            }
        }
    </style>
    <script>
        function togglePassword() {
            var pwd = document.getElementById('password');
            var icon = document.getElementById('togglePwdIcon');
            if (pwd.type === 'password') {
                pwd.type = 'text';
                icon.innerHTML = `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.667 10S4.167 4.167 10 4.167 18.333 10 18.333 10 15.833 15.833 10 15.833 1.667 10 1.667 10Z" stroke="#6366f1" stroke-width="1.2"/><circle cx="10" cy="10" r="2.5" stroke="#6366f1" stroke-width="1.2"/><line x1="5" y1="15" x2="15" y2="5" stroke="#ef4444" stroke-width="1.2"/></svg>`;
            } else {
                pwd.type = 'password';
                icon.innerHTML = `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.667 10S4.167 4.167 10 4.167 18.333 10 18.333 10 15.833 15.833 10 15.833 1.667 10 1.667 10Z" stroke="#6366f1" stroke-width="1.2"/><circle cx="10" cy="10" r="2.5" stroke="#6366f1" stroke-width="1.2"/></svg>`;
            }
        }
        // Set initial icon on page load
        window.addEventListener('DOMContentLoaded', function() {
            var icon = document.getElementById('togglePwdIcon');
            if (icon) {
                icon.innerHTML = `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.667 10S4.167 4.167 10 4.167 18.333 10 18.333 10 15.833 15.833 10 15.833 1.667 10 1.667 10Z" stroke="#6366f1" stroke-width="1.2"/><circle cx="10" cy="10" r="2.5" stroke="#6366f1" stroke-width="1.2"/></svg>`;
            }
        });
    </script>
</head>
<body>
    <div class="container">
        <div style="text-align:center; margin-bottom: 1.2rem;">
            <img src="{{ asset('logo.png') }}" alt="Logo" style="height:70px;">
        </div>
        <h2 style="margin-top:0px">Admin Login</h2>
        @if ($errors->any())
            <div class="error">
                {{ $errors->first() }}
            </div>
        @endif
        <form method="POST" action="{{ route('admin.login') }}" autocomplete="off">
            @csrf
                        <div class="input-group">
                                <span class="icon">
                                    <!-- Email SVG Icon -->
                                    <svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" rx="4" fill="#6366f1" fill-opacity="0.08"/><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v7A2.5 2.5 0 0 1 13.5 16h-7A2.5 2.5 0 0 1 4 13.5v-7Zm1.75.25 4.25 3.25 4.25-3.25" stroke="#6366f1" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                </span>
                                <input type="email" name="email" placeholder="Email" value="{{ old('email') }}" required autofocus>
                        </div>
                        <div class="input-group">
                                <span class="icon">
                                    <!-- Lock SVG Icon -->
                                    <svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" rx="4" fill="#6366f1" fill-opacity="0.08"/><rect x="5.5" y="9" width="9" height="6" rx="2" stroke="#6366f1" stroke-width="1.2"/><path d="M8 9V7.5A2 2 0 0 1 12 7.5V9" stroke="#6366f1" stroke-width="1.2"/></svg>
                                </span>
                                <input type="password" name="password" id="password" placeholder="Password" required>
                                <button type="button" class="toggle-password" onclick="togglePassword()"><span id="togglePwdIcon"></span></button>
                        </div>
            <button type="submit">Login</button>
        </form>
    </div>
</body>
</html>