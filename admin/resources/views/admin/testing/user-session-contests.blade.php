@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-md-6">
            <div class="card">
                <div class="card-header d-flex justify-content-between">
                    <div>
                        <h5 class="mb-0">Contests in {{ $session->name }}</h5>
                        <small class="text-muted">User: {{ $user->name ?? 'User' }} (ID: {{ $user->id }}) | Session ID: {{ $session->id }}</small>
                    </div>
                    <a href="{{ route('admin.testing.user-detail', $user->id) }}" class="btn btn-sm btn-outline-secondary">Back to User</a>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Category</th>
                                    <th>Entry Fee</th>
                                    <th>Participants</th>
                                    <th>Created</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($contests as $contest)
                                <tr>
                                    <td>{{ $contest->id }}</td>
                                    <td>{{ $contest->category }}</td>
                                    <td>{{ $contest->entry_fee }}</td>
                                    <td>{{ $contest->participants }}</td>
                                    <td>{{ date('M d, H:i', strtotime($contest->created_at)) }}</td>
                                    <td>
                                        <button class="btn btn-xs btn-outline-primary me-1" onclick="selectContest({{ $contest->id }})">Select</button>
                                        <button class="btn btn-xs btn-outline-success" onclick="showSelectBasketModal({{ $contest->id }})">Select Basket</button>
                                    </td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card mt-3">
                <div class="card-header d-flex justify-content-between">
                    <h5 class="mb-0">Joined Contests</h5>
                </div>
                <div class="card-body">
                    <div id="joinedContestsList">
                        <div class="text-center text-muted">Loading joined contests...</div>
                    </div>
                </div>
            </div>
            
            <div class="card mt-3">
                <div class="card-header d-flex justify-content-between">
                    <h5 class="mb-0">Baskets</h5>
                    <button class="btn btn-sm btn-primary" onclick="showCreateForm()">Create Basket</button>
                </div>
                <div class="card-body">
                    <div id="basketsList">
                        <div class="text-center text-muted">Loading baskets...</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Select Basket Modal -->
<div class="modal fade" id="selectBasketModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Select Basket for Contest <span id="selectedContestId"></span></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div id="basketSelectionList">
                    <div class="text-center text-muted">Loading baskets...</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            </div>
        </div>
    </div>
</div>

<!-- Create Basket Modal -->
<div class="modal fade" id="createBasketModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create Basket - Select Assets</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <form id="createBasketForm">
                    <input type="hidden" name="user_id" value="{{ $user->id }}">
                    <input type="hidden" name="session_id" value="{{ $session->id }}">
                    
                    <!-- Asset Categories -->
                    <div class="mb-3">
                        <label class="form-label">Select Assets by Category</label>
                        <div id="assetCategories">
                            <div class="text-center text-muted">Loading categories...</div>
                        </div>
                    </div>
                    
                    <!-- Selected Assets -->
                    <div class="mb-3">
                        <label class="form-label">Selected Assets (<span id="selectedCount">0</span>)</label>
                        <div id="selectedAssets" class="border rounded p-2 min-height-50">
                            <div class="text-muted">No assets selected</div>
                        </div>
                    </div>
                    
                    <!-- Multipliers -->
                    <div class="mb-3" id="multipliersSection" style="display: none;">
                        <label class="form-label">Set Multipliers for Selected Assets</label>
                        <div id="multiplierInputs" class="border rounded p-2">
                            <!-- Multiplier inputs will be generated here -->
                        </div>
                        <small class="text-muted">Higher multipliers give more weight to asset performance</small>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" onclick="createBasket()" id="createBtn" disabled>Create Basket</button>
            </div>
        </div>
    </div>
</div>

<style>
.asset-item {
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
    border-radius: 10px;
}
.asset-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
}
.asset-item.selected {
    border-color: #007bff;
    background-color: #f8f9ff !important;
}
.asset-item.selected .bg-light {
    background-color: #e3f2fd !important;
}
.selected-asset {
    display: inline-block;
    background-color: #e3f2fd;
    border: 1px solid #2196f3;
    border-radius: 15px;
    padding: 5px 10px;
    margin: 2px;
    font-size: 12px;
}
.min-height-50 {
    min-height: 50px;
}
.modal-lg {
    max-width: 900px;
}
</style>

<script>
let selectedAssets = [];
let availableCategories = [];
let currentContestId = null;

function showSelectBasketModal(contestId) {
    currentContestId = contestId;
    document.getElementById('selectedContestId').textContent = contestId;
    
    const modalElement = document.getElementById('selectBasketModal');
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
    
    loadBasketsForSelection();
}

function loadBasketsForSelection() {
    fetch('/admin/testing/baskets/{{ $user->id }}/{{ $session->id }}')
        .then(response => response.json())
        .then(data => {
            let html = '';
            
            // Filter standalone baskets (not assigned to contests)
            const standaloneBaskets = data.filter(basket => !basket.contest_id || basket.is_standalone);
            
            if (standaloneBaskets.length === 0) {
                html = '<div class="text-center text-muted">No available baskets found. Create a basket first.</div>';
            } else {
                html = '<div class="list-group">';
                standaloneBaskets.forEach(basket => {
                    const assets = JSON.parse(basket.assets || '[]');
                    const assetNames = assets.map(a => a.symbol).join(', ');
                    
                    html += `<div class="list-group-item list-group-item-action" onclick="assignBasketToContest(${basket.id})" style="cursor: pointer;">
                        <div class="d-flex w-100 justify-content-between">
                            <h6 class="mb-1">Basket #${basket.id}</h6>
                            <small>${new Date(basket.created_at).toLocaleDateString()}</small>
                        </div>
                        <p class="mb-1"><strong>Assets:</strong> ${assetNames}</p>
                        <small class="text-muted">${assets.length} assets • Score: ${basket.total_score || 0}</small>
                    </div>`;
                });
                html += '</div>';
            }
            
            document.getElementById('basketSelectionList').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading baskets:', error);
            document.getElementById('basketSelectionList').innerHTML = '<div class="text-center text-danger">Error loading baskets</div>';
        });
}

function assignBasketToContest(basketId) {
    if (!currentContestId) {
        alert('No contest selected');
        return;
    }
    
    // Update basket to assign it to the contest
    fetch('/api/assign-basket-to-contest', {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN': '{{ csrf_token() }}',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            basket_id: basketId,
            contest_id: currentContestId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('selectBasketModal')).hide();
            loadBaskets();
            loadJoinedContests();
            alert('Basket assigned to contest successfully!');
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error assigning basket:', error);
        alert('Error assigning basket to contest');
    });
}

function selectContest(contestId) {
    // Auto-open the create basket modal
    showCreateForm();
}

function showCreateForm() {
    try {
        const modalElement = document.getElementById('createBasketModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        loadAssets();
    } catch (error) {
        console.error('Error showing modal:', error);
        alert('Error opening modal. Check console for details.');
    }
}

function loadContests() {
    fetch('/api/session-contests/{{ $session->id }}')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                availableContests = data.contests;
                renderContests();
            }
        })
        .catch(error => {
            console.error('Error loading contests:', error);
        });
}

function renderContests() {
    let html = '';
    
    if (availableContests.length === 0) {
        html = '<li class="text-center text-muted p-2">No contests found</li>';
    } else {
        availableContests.forEach(contest => {
            html += `<li>
                <div class="form-check px-3 py-2">
                    <input class="form-check-input" type="checkbox" value="${contest.id}" id="contest_${contest.id}" onchange="toggleContest(${contest.id})">
                    <label class="form-check-label" for="contest_${contest.id}">
                        <strong>Contest ${contest.id}</strong> - ${contest.category}<br>
                        <small class="text-muted">Fee: ${contest.entry_fee} | Participants: ${contest.participants}</small>
                    </label>
                </div>
            </li>`;
        });
    }
    
    document.getElementById('contestList').innerHTML = html;
}

function toggleContest(contestId) {
    const checkbox = document.getElementById(`contest_${contestId}`);
    
    if (checkbox.checked) {
        if (!selectedContests.includes(contestId)) {
            selectedContests.push(contestId);
        }
    } else {
        selectedContests = selectedContests.filter(id => id !== contestId);
    }
    
    updateContestDisplay();
}

function updateContestDisplay() {
    document.getElementById('selectedContestCount').textContent = selectedContests.length;
}

function loadAssets() {
    fetch('/api/session-assets/{{ $session->id }}')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                availableCategories = data.categories;
                renderCategories();
            }
        })
        .catch(error => {
            console.error('Error loading assets:', error);
        });
}

function renderCategories() {
    let html = '';
    
    availableCategories.forEach(category => {
        html += `<div class="mb-4">
            <h6 class="text-primary mb-3">
                <i class="bi bi-tag me-1"></i>
                ${category.display_name}
                <span class="badge bg-primary ms-2">${category.count} assets</span>
                <span class="badge bg-info ms-1">${category.country}</span>
                <span class="badge bg-warning ms-1">${category.cap_size}</span>
            </h6>
            <div class="row">`;
            
        category.assets.forEach(asset => {
            html += `<div class="col-md-6 mb-3">
                <div class="asset-item" onclick="toggleAsset('${category.category_name}', '${asset.symbol}')" data-symbol="${asset.symbol}">
                    <div class="d-flex align-items-center p-3 bg-light rounded">
                        <div class="me-3">
                            <img src="${asset.image}" alt="${asset.symbol}" class="rounded-circle" 
                                 style="width: 40px; height: 40px; object-fit: cover;"
                                 onerror="this.src='https://ui-avatars.com/api/?name=${asset.symbol}&size=40&background=28a745&color=fff';">
                        </div>
                        <div>
                            <div class="fw-bold text-success">${asset.symbol}</div>
                            <small class="text-muted">${asset.name}</small>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        
        html += `</div></div>`;
    });
    
    if (availableCategories.length === 0) {
        html = '<div class="text-center py-4"><i class="bi bi-exclamation-triangle display-4 text-warning"></i><h5 class="mt-3">No Assets Found</h5><p class="text-muted">This session has no saved assets.</p></div>';
    }
    
    document.getElementById('assetCategories').innerHTML = html;
}

function toggleAsset(categoryName, symbol) {
    const assetElement = document.querySelector(`[data-symbol="${symbol}"]`);
    let asset = null;
    
    // Find asset in categories
    for (let category of availableCategories) {
        asset = category.assets.find(a => a.symbol === symbol);
        if (asset) {
            asset.category = categoryName;
            break;
        }
    }
    
    if (selectedAssets.find(a => a.symbol === symbol)) {
        // Remove asset
        selectedAssets = selectedAssets.filter(a => a.symbol !== symbol);
        assetElement.classList.remove('selected');
    } else {
        // Add asset
        selectedAssets.push(asset);
        assetElement.classList.add('selected');
    }
    
    updateSelectedDisplay();
}

function updateSelectedDisplay() {
    const container = document.getElementById('selectedAssets');
    const countElement = document.getElementById('selectedCount');
    const createBtn = document.getElementById('createBtn');
    const multipliersSection = document.getElementById('multipliersSection');
    
    countElement.textContent = selectedAssets.length;
    
    if (selectedAssets.length === 0) {
        container.innerHTML = '<div class="text-muted">No assets selected</div>';
        createBtn.disabled = true;
        multipliersSection.style.display = 'none';
    } else {
        let html = '';
        selectedAssets.forEach(asset => {
            html += `<span class="selected-asset">
                ${asset.symbol} - ${asset.name}
                <button type="button" class="btn-close btn-close-sm ms-1" onclick="removeAsset('${asset.symbol}')"></button>
            </span>`;
        });
        container.innerHTML = html;
        createBtn.disabled = false;
        multipliersSection.style.display = 'block';
        updateMultiplierInputs();
    }
}

function updateMultiplierInputs() {
    const container = document.getElementById('multiplierInputs');
    let html = '';
    
    selectedAssets.forEach((asset, index) => {
        const defaultMultiplier = (2 - (index * 0.1)).toFixed(1);
        html += `<div class="row mb-2 align-items-center">
            <div class="col-6">
                <strong>${asset.symbol}</strong>
                <small class="text-muted d-block">${asset.name}</small>
            </div>
            <div class="col-6">
                <input type="number" class="form-control form-control-sm" 
                       id="multiplier_${asset.symbol}" 
                       value="${defaultMultiplier}" 
                       min="0.1" max="5" step="0.1" 
                       placeholder="Multiplier">
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

function removeAsset(symbol) {
    selectedAssets = selectedAssets.filter(a => a.symbol !== symbol);
    document.querySelector(`[data-symbol="${symbol}"]`).classList.remove('selected');
    updateSelectedDisplay();
}

function loadJoinedContests() {
    fetch('/admin/testing/baskets/{{ $user->id }}/{{ $session->id }}')
        .then(response => response.json())
        .then(data => {
            const joinedContests = [...new Set(data.map(basket => basket.contest_id).filter(id => id))];
            let html = '';
            
            if (joinedContests.length === 0) {
                html = '<div class="text-center text-muted">No contests joined yet</div>';
            } else {
                joinedContests.forEach(contestId => {
                    const contestBaskets = data.filter(b => b.contest_id === contestId);
                    
                    html += `<div class="card border-success mb-3">
                        <div class="card-header bg-light">
                            <h6 class="mb-0">Contest ${contestId}</h6>
                            <small class="text-muted">${contestBaskets.length} basket(s)</small>
                        </div>
                        <div class="card-body p-2">`;
                    
                    contestBaskets.forEach(basket => {
                        const assets = JSON.parse(basket.assets || '[]');
                        const assetNames = assets.slice(0, 3).map(a => a.symbol).join(', ');
                        const moreAssets = assets.length > 3 ? ` +${assets.length - 3} more` : '';
                        
                        html += `<div class="d-flex justify-content-between align-items-center mb-2 p-2 bg-white rounded border">
                            <div>
                                <strong>Basket #${basket.id}</strong>
                                <div class="small text-muted">${assetNames}${moreAssets}</div>
                            </div>
                            <div class="text-end">
                                <div class="small text-success">Score: ${basket.total_score || 0}</div>
                                <div class="small text-muted">${assets.length} assets</div>
                            </div>
                        </div>`;
                    });
                    
                    html += `</div></div>`;
                });
            }
            
            document.getElementById('joinedContestsList').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading joined contests:', error);
            document.getElementById('joinedContestsList').innerHTML = '<div class="text-center text-danger">Error loading joined contests</div>';
        });
}

function loadBaskets() {
    console.log('Loading baskets for user {{ $user->id }} and session {{ $session->id }}');
    fetch('/admin/testing/baskets/{{ $user->id }}/{{ $session->id }}')
        .then(response => {
            console.log('Response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Baskets data:', data);
            let html = '';
            if (!data || data.length === 0) {
                html = '<div class="text-center text-muted">No baskets found</div>';
            } else {
                html = '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>ID</th><th>Contest</th><th>Score</th><th>Created</th><th>Action</th></tr></thead><tbody>';
                data.forEach(basket => {
                    const createdDate = basket.created_at ? new Date(basket.created_at).toLocaleDateString() : 'N/A';
                    html += `<tr>
                        <td>${basket.id}</td>
                        <td>${basket.contest_id || 'N/A'}</td>
                        <td>${basket.total_score || 0}</td>
                        <td>${createdDate}</td>
                        <td><button class="btn btn-xs btn-outline-danger" onclick="deleteBasket(${basket.id})">Delete</button></td>
                    </tr>`;
                });
                html += '</tbody></table></div>';
            }
            document.getElementById('basketsList').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading baskets:', error);
            document.getElementById('basketsList').innerHTML = '<div class="text-center text-danger">Error loading baskets</div>';
        });
}

function createBasket() {
    if (selectedAssets.length === 0) {
        alert('Please select at least one asset');
        return;
    }
    
    // Get multipliers from inputs
    const multipliers = [];
    selectedAssets.forEach(asset => {
        const multiplierInput = document.getElementById(`multiplier_${asset.symbol}`);
        const multiplier = multiplierInput ? parseFloat(multiplierInput.value) || 1.0 : 1.0;
        multipliers.push(multiplier);
    });
    
    const basketData = {
        user_id: {{ $user->id }},
        contest_id: null,
        session_id: {{ $session->id }},
        assets: selectedAssets,
        multipliers: multipliers,
        is_standalone: true
    };
    
    fetch('/api/save-basket', {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN': '{{ csrf_token() }}',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(basketData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('createBasketModal')).hide();
            resetForm();
            loadBaskets();
            loadJoinedContests();
            alert('Basket created successfully!');
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error creating basket:', error);
        alert('Error creating basket');
    });
}

function resetForm() {
    selectedAssets = [];
    document.querySelectorAll('.asset-item').forEach(el => el.classList.remove('selected'));
    updateSelectedDisplay();
}

function deleteBasket(basketId) {
    if (!confirm('Delete this basket?')) return;
    
    fetch('/admin/testing/delete-basket/' + basketId, {
        method: 'DELETE',
        headers: {
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadBaskets();
            loadJoinedContests();
            alert('Basket deleted successfully');
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadBaskets();
    loadJoinedContests();
});
</script>
@endsection