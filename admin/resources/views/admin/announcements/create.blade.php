
@extends('admin.layouts.app')

@section('title', 'Create Announcement')

@section('content')
<div class="container-fluid">
    <div class="row justify-content-center">
        <div class="col-lg-7">
            <div class="card shadow-sm mb-4">
                <div class="card-header fw-bold">Create Announcement</div>
                <div class="card-body">
                    <form method="POST" action="{{ route('admin.announcements.store') }}">
                        @csrf
                        <div class="mb-3">
                            <label for="title" class="form-label">Title</label>
                            <input type="text" id="title" name="title" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label for="description" class="form-label">Description</label>
                            <textarea id="description" name="description" class="form-control" rows="5" required></textarea>
                        </div>
                        <div class="mb-3">
                            <label for="type" class="form-label">Type</label>
                            <select id="type" name="type" class="form-select" required>
                                <option value="update">Update</option>
                                <option value="alert">Alert</option>
                                <option value="promo">Promo</option>
                            </select>
                        </div>
                        
                        <div class="mb-3">
                            <label for="send_to" class="form-label">Send Notification To</label>
                            <select id="send_to" name="send_to" class="form-select" onchange="toggleUserSelection()" required>
                                <option value="all">All Users</option>
                                <option value="specific">Specific Users</option>
                            </select>
                        </div>
                        
                        <div class="mb-3" id="user_selection" style="display: none;">
                            <label class="form-label">Select Users</label>
                            <input type="text" id="userSearch" class="form-control mb-2" placeholder="Search by name or mobile..." onkeyup="searchUsers()">
                            <div class="border rounded p-3" style="height: 250px; overflow-y: auto;">
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="select_all" onchange="toggleAllUsers()">
                                    <label class="form-check-label fw-bold" for="select_all">
                                        Select All Users
                                    </label>
                                </div>
                                <hr>
                                @foreach($users as $user)
                                <div class="form-check mb-1 user-item" data-name="{{ strtolower($user->name) }}" data-mobile="{{ $user->mobile }}">
                                    <input class="form-check-input user-checkbox" type="checkbox" name="user_ids[]" value="{{ $user->id }}" id="user_{{ $user->id }}">
                                    <label class="form-check-label" for="user_{{ $user->id }}">
                                        {{ $user->name }} ({{ $user->mobile }})
                                    </label>
                                </div>
                                @endforeach
                            </div>
                        </div>
                        <div class="d-flex gap-2">
                            <a href="{{ route('admin.announcements.index') }}" class="btn btn-outline-secondary">
                                <i class="bi bi-arrow-left"></i> Back
                            </a>
                            <button type="submit" class="btn btn-success">
                                <i class="bi bi-plus-lg"></i> Create Announcement
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection

@section('head')
<script>
function toggleUserSelection() {
    const sendTo = document.getElementById('send_to').value;
    const userSelection = document.getElementById('user_selection');
    
    if (sendTo === 'specific') {
        userSelection.style.display = 'block';
    } else {
        userSelection.style.display = 'none';
    }
}

function toggleAllUsers() {
    const selectAll = document.getElementById('select_all');
    const userCheckboxes = document.querySelectorAll('.user-checkbox:not([style*="display: none"])');
    
    userCheckboxes.forEach(checkbox => {
        if (checkbox.closest('.user-item').style.display !== 'none') {
            checkbox.checked = selectAll.checked;
        }
    });
}

function searchUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const userItems = document.querySelectorAll('.user-item');
    
    userItems.forEach(item => {
        const name = item.getAttribute('data-name');
        const mobile = item.getAttribute('data-mobile');
        
        if (name.includes(searchTerm) || mobile.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}
</script>
@endsection

