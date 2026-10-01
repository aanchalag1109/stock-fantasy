<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Contest Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100">
    <div class="flex h-screen">
        <!-- Sidebar -->
        <div class="w-64 bg-blue-800 text-white">
            <div class="p-6">
                <h2 class="text-xl font-bold">Admin Panel</h2>
                <p class="text-blue-200 text-sm">Contest Management</p>
            </div>
            
            <nav class="mt-6">
                <a href="{{ route('admin.contests.dashboard') }}" class="flex items-center px-6 py-3 bg-blue-700 border-r-4 border-blue-400">
                    <i class="fas fa-tachometer-alt mr-3"></i>
                    Dashboard
                </a>
                <a href="#" class="flex items-center px-6 py-3 hover:bg-blue-700">
                    <i class="fas fa-trophy mr-3"></i>
                    All Contests
                </a>
                <a href="#" class="flex items-center px-6 py-3 hover:bg-blue-700">
                    <i class="fas fa-users mr-3"></i>
                    Participants
                </a>
                <a href="#" class="flex items-center px-6 py-3 hover:bg-blue-700">
                    <i class="fas fa-chart-line mr-3"></i>
                    Live Assets
                </a>
                <a href="#" class="flex items-center px-6 py-3 hover:bg-blue-700">
                    <i class="fas fa-cog mr-3"></i>
                    Settings
                </a>
            </nav>
        </div>

        <!-- Main Content -->
        <div class="flex-1 overflow-x-hidden overflow-y-auto">
            <header class="bg-white shadow-sm border-b border-gray-200">
                <div class="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
                    <h1 class="text-2xl font-bold text-gray-900">Contest Dashboard</h1>
                </div>
            </header>

            <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <!-- Stats Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-trophy text-blue-500 text-2xl"></i>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">Total Contests</dt>
                                        <dd class="text-lg font-medium text-gray-900">{{ $contests->count() }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-play text-red-500 text-2xl"></i>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">Live Contests</dt>
                                        <dd class="text-lg font-medium text-gray-900">{{ $contests->where('contest_status', 'live')->count() }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-users text-green-500 text-2xl"></i>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">Total Participants</dt>
                                        <dd class="text-lg font-medium text-gray-900">{{ $contests->sum('participants_count') }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-rupee-sign text-yellow-500 text-2xl"></i>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">Total Prize Pool</dt>
                                        <dd class="text-lg font-medium text-gray-900">₹{{ number_format($contests->sum('prize_pool')) }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Contests Table -->
                <div class="bg-white shadow overflow-hidden sm:rounded-md">
                    <div class="px-4 py-5 sm:px-6 flex justify-between items-center">
                        <div class="flex items-center">
                            <input type="checkbox" id="selectAll" class="mr-3">
                            <div>
                                <h3 class="text-lg leading-6 font-medium text-gray-900">All Contests</h3>
                                <p class="mt-1 max-w-2xl text-sm text-gray-500">Manage and monitor all contests</p>
                            </div>
                        </div>
                        <div class="flex space-x-2">
                            <button onclick="bulkDelete()" id="bulkDeleteBtn" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium" style="display:none;">
                                <i class="fas fa-trash mr-2"></i>Delete Selected
                            </button>
                            <button class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                                <i class="fas fa-plus mr-2"></i>New Contest
                            </button>
                        </div>
                    </div>
                    
                    <ul class="divide-y divide-gray-200">
                        @foreach($contests as $contest)
                        <li>
                            <div class="px-4 py-4 flex items-center justify-between">
                                <div class="flex items-center">
                                    @if($contest->contest_status !== 'live')
                                    <input type="checkbox" class="contest-checkbox mr-3" value="{{ $contest->id }}">
                                    @else
                                    <div class="w-4 h-4 mr-3"></div>
                                    @endif
                                    <div class="flex-shrink-0 h-10 w-10">
                                        <div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                            <i class="fas fa-trophy text-blue-600"></i>
                                        </div>
                                    </div>
                                    <div class="ml-4">
                                        <div class="text-sm font-medium text-gray-900">{{ $contest->contest_name }}</div>
                                        <div class="text-sm text-gray-500">
                                            {{ $contest->participants_count ?? 0 }} participants • ₹{{ number_format($contest->prize_pool) }} prize pool
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="flex items-center space-x-4">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                        @if($contest->contest_status === 'live') bg-red-100 text-red-800
                                        @elseif($contest->contest_status === 'completed') bg-gray-100 text-gray-800
                                        @else bg-yellow-100 text-yellow-800 @endif">
                                        @if($contest->contest_status === 'live')
                                            <span class="w-1.5 h-1.5 bg-red-400 rounded-full mr-1.5"></span>
                                        @endif
                                        {{ strtoupper($contest->contest_status) }}
                                    </span>
                                    
                                    <div class="flex space-x-2">
                                        <a href="{{ route('admin.contests.show', $contest->id) }}" 
                                           class="text-blue-600 hover:text-blue-900 text-sm font-medium">
                                            <i class="fas fa-eye mr-1"></i>View
                                        </a>
                                        
                                        @if($contest->contest_status === 'upcoming')
                                        <button onclick="updateContestStatus({{ $contest->id }}, 'live')" 
                                                class="text-green-600 hover:text-green-900 text-sm font-medium">
                                            <i class="fas fa-play mr-1"></i>Start
                                        </button>
                                        @endif
                                        
                                        @if($contest->contest_status === 'live')
                                        <button onclick="updateContestStatus({{ $contest->id }}, 'completed')" 
                                                class="text-red-600 hover:text-red-900 text-sm font-medium">
                                            <i class="fas fa-stop mr-1"></i>End
                                        </button>
                                        @endif
                                    </div>
                                </div>
                            </div>
                        </li>
                        @endforeach
                    </ul>
                    
                    @if($contests->hasPages())
                    <div class="px-4 py-3 bg-gray-50 border-t border-gray-200">
                        <div class="flex justify-between items-center">
                            <div class="text-sm text-gray-700">
                                Showing {{ $contests->firstItem() }} to {{ $contests->lastItem() }} of {{ $contests->total() }} contests
                            </div>
                            <div>
                                {{ $contests->links() }}
                            </div>
                        </div>
                    </div>
                    @endif
                </div>
            </main>
        </div>
    </div>

    <script>
        // Bulk delete functionality
        document.addEventListener('DOMContentLoaded', function() {
            const selectAllCheckbox = document.getElementById('selectAll');
            const contestCheckboxes = document.querySelectorAll('.contest-checkbox');
            const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
            
            // Select all functionality
            selectAllCheckbox?.addEventListener('change', function() {
                contestCheckboxes.forEach(checkbox => {
                    checkbox.checked = this.checked;
                });
                toggleBulkDeleteButton();
            });
            
            contestCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', toggleBulkDeleteButton);
            });
            
            function toggleBulkDeleteButton() {
                const checkedBoxes = document.querySelectorAll('.contest-checkbox:checked');
                if (checkedBoxes.length > 0) {
                    bulkDeleteBtn.style.display = 'inline-block';
                } else {
                    bulkDeleteBtn.style.display = 'none';
                }
            }
        });
        
        function bulkDelete() {
            const checkedBoxes = document.querySelectorAll('.contest-checkbox:checked');
            if (checkedBoxes.length === 0) {
                alert('Please select contests to delete.');
                return;
            }
            
            if (!confirm(`Are you sure you want to delete ${checkedBoxes.length} selected contests?`)) {
                return;
            }
            
            const contestIds = Array.from(checkedBoxes).map(cb => cb.value);
            
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '{{ route("admin.contests.bulk_delete") }}';
            
            const csrfToken = document.createElement('input');
            csrfToken.type = 'hidden';
            csrfToken.name = '_token';
            csrfToken.value = '{{ csrf_token() }}';
            form.appendChild(csrfToken);
            
            contestIds.forEach(id => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'contest_ids[]';
                input.value = id;
                form.appendChild(input);
            });
            
            document.body.appendChild(form);
            form.submit();
        }
        
        function updateContestStatus(contestId, status) {
            if (confirm(`Are you sure you want to ${status} this contest?`)) {
                fetch(`/admin/contests/${contestId}/status`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ status: status })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('Error updating contest status');
                    }
                });
            }
        }
    </script>
</body>
</html>