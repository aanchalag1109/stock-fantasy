@extends('admin.layouts.app')
@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-pencil-fill text-warning me-2"></i>Edit Template</h1>
            <p class="text-muted mb-0">Modify template configuration and asset selection</p>
        </div>
        <a href="{{ route('admin.templates.index') }}" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Templates
        </a>
    </div>

    <div class="row">
        <div class="col-12">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-gradient-primary text-white">
                    <h5 class="mb-0"><i class="bi bi-gear-fill me-2"></i>Template Configuration</h5>
                </div>
                <div class="card-body p-4">
                    <form action="{{ route('admin.templates.update', $template) }}" method="POST">
                        @csrf
                        @method('PUT')
                        
                        <!-- Basic Information Section -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-primary mb-3"><i class="bi bi-info-circle me-2"></i>Basic Information</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="template_name" class="form-label fw-semibold">Template Name <span class="text-danger">*</span></label>
                                    <input type="text" name="template_name" id="template_name" class="form-control form-control-lg" value="{{ $template->template_name }}" required>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="name" class="form-label fw-semibold">Session Name <span class="text-danger">*</span></label>
                                    <input type="text" name="name" id="name" class="form-control form-control-lg" value="{{ $template->name }}" required>
                                </div>
                            </div>
                        </div>

                        <div class="row mb-4">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="market_type" class="form-label fw-semibold">Market Type <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-lg" id="market_type" name="market_type" required onchange="loadCapSizes()">
                                        <option value="">Choose market type</option>
                                        <option value="stock" {{ $template->market_type == 'stock' ? 'selected' : '' }}>Stock Market</option>
                                        <option value="crypto" {{ $template->market_type == 'crypto' ? 'selected' : '' }}>Cryptocurrency</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-6" id="country-section" style="display:none;">
                                <div class="mb-3">
                                    <label for="country" class="form-label fw-semibold">Country <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-lg" id="country" name="country" onchange="loadCapSizeTabs()">
                                        <option value="">Choose country</option>
                                        <option value="Indian">Indian</option>
                                        <option value="US">USA</option>
                                        <option value="UK">UK</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="row mb-4">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="max_stocks" class="form-label fw-semibold">Max Assets in Portfolio <span class="text-danger">*</span></label>
                                    <input type="number" name="max_stocks" id="max_stocks" class="form-control form-control-lg" value="{{ $template->max_stocks }}" min="1" max="50" required>
                                    <div class="form-text">Maximum number of assets a user can hold in their portfolio</div>
                                </div>
                            </div>
                        </div>

                        <!-- Assets Selection Section -->
                        <div id="category-tabs-section" style="display:none;" class="mb-4">
                            <div class="row">
                                <div class="col-12">
                                    <h6 class="text-primary mb-3"><i class="bi bi-collection me-2"></i>Asset Selection</h6>
                                </div>
                            </div>
                            <div class="card border-0 bg-light">
                                <div class="card-body">
                                    <ul class="nav nav-pills nav-fill mb-3" id="categoryTabs" role="tablist"></ul>
                                    <div class="tab-content" id="categoryTabContent"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="row">
                            <div class="col-12">
                                <div class="d-flex gap-3 justify-content-end">
                                    <a href="{{ route('admin.templates.index') }}" class="btn btn-outline-secondary btn-lg px-4">
                                        <i class="bi bi-x-circle me-2"></i>Cancel
                                    </a>
                                    <button type="submit" class="btn btn-warning btn-lg px-4">
                                        <i class="bi bi-check-circle me-2"></i>Update Template
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.card {
    border-radius: 15px;
    transition: all 0.3s ease;
}

.form-control, .form-select {
    border-radius: 10px;
    border: 2px solid #e9ecef;
    transition: all 0.3s ease;
}

.form-control:focus, .form-select:focus {
    border-color: #667eea;
    box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
}

.nav-pills .nav-link {
    border-radius: 25px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.nav-pills .nav-link.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.btn {
    border-radius: 10px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.btn-warning {
    background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
    border: none;
    color: white;
}

.btn-warning:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(243, 156, 18, 0.4);
}

.text-primary {
    color: #667eea !important;
}

.table-responsive {
    border-radius: 10px;
    overflow: hidden;
}

.table th {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: 600;
    border: none;
}

.table td {
    vertical-align: middle;
    border-color: #f8f9fa;
}

.table tbody tr:hover {
    background-color: #f8f9fa;
    transform: scale(1.01);
    transition: all 0.2s ease;
}

.form-check-input:checked {
    background-color: #667eea;
    border-color: #667eea;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}
</style>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        const marketType = document.getElementById('market_type').value;
        if (marketType) {
            if (marketType === 'stock') {
                document.getElementById('country-section').style.display = 'block';
                document.getElementById('country').value = 'Indian';
                loadCapSizeTabs();
            } else if (marketType === 'crypto') {
                loadCategoriesForCrypto();
            }
            
            setTimeout(() => {
                const assetsData = @json($template->assets_data);
                if (assetsData) {
                    selectTemplateAssets(assetsData, marketType);
                }
            }, 3000);
        }
    });

    function loadCapSizes() {
        var marketType = document.getElementById('market_type').value;
        var tabsSection = document.getElementById('category-tabs-section');
        
        if (!marketType) {
            tabsSection.style.display = 'none';
            return;
        }
        
        if (marketType === 'crypto') {
            document.getElementById('country-section').style.display = 'none';
            loadCategoriesForCrypto();
        } else {
            document.getElementById('country-section').style.display = 'block';
            tabsSection.style.display = 'none';
        }
    }
    
    function loadCapSizeTabs() {
        var country = document.getElementById('country').value;
        var tabsSection = document.getElementById('category-tabs-section');
        
        if (!country) {
            tabsSection.style.display = 'none';
            return;
        }
        
        fetch(`{{ url('admin/api/categories/stock') }}`)
            .then(response => response.json())
            .then(categories => {
                var filteredCategories = categories.filter(cat => 
                    cat.name.includes(country)
                );
                
                if (filteredCategories.length > 0) {
                    createCategoryTabs(filteredCategories, 'stock');
                    tabsSection.style.display = 'block';
                }
            });
    }
    
    function loadCategoriesForCrypto() {
        fetch(`{{ url('admin/api/categories/crypto') }}`)
            .then(response => response.json())
            .then(categories => {
                if (categories.length > 0) {
                    createCategoryTabs(categories, 'crypto');
                    document.getElementById('category-tabs-section').style.display = 'block';
                }
            });
    }
    
    function createCategoryTabs(categories, marketType) {
        var tabsHtml = '';
        var contentHtml = '';
        
        categories.forEach((category, index) => {
            var isActive = index === 0 ? 'active' : '';
            var isShow = index === 0 ? 'show active' : '';
            
            tabsHtml += `<li class="nav-item" role="presentation">
                <button class="nav-link ${isActive}" id="tab-${category.id}" data-bs-toggle="tab" data-bs-target="#content-${category.id}" type="button" role="tab" data-category-name="${category.name}" data-category-id="${category.id}">${category.name}</button>
            </li>`;
            
            contentHtml += `<div class="tab-pane fade ${isShow}" id="content-${category.id}" role="tabpanel">
                <div class="p-4">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div>
                            <h6 class="mb-1 text-primary">Select ${category.name}</h6>
                            <small class="text-muted">Choose assets for this category</small>
                        </div>
                        <div class="badge bg-primary fs-6" id="selected-count-${category.id}">0 selected</div>
                    </div>
                    <div class="table-responsive" style="max-height:500px;overflow-y:auto;border-radius:10px;">
                        <div id="loader-${category.id}" class="text-center py-5" style="display:none;">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <div class="mt-2 text-muted">Loading assets...</div>
                        </div>
                        <table class="table table-hover mb-0" id="table-${category.id}">
                            <thead class="sticky-top">
                                <tr>
                                    <th width="60" class="text-center">Select</th>
                                    <th>Asset Details</th>
                                </tr>
                            </thead>
                            <tbody id="assets-${category.id}"></tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        });
        
        document.getElementById('categoryTabs').innerHTML = tabsHtml;
        document.getElementById('categoryTabContent').innerHTML = contentHtml;
        
        categories.forEach((category, index) => {
            setTimeout(() => {
                loadAssetsForCategory(category.id, marketType);
            }, 100 * (index + 1));
        });
    }
    
    function loadAssetsForCategory(categoryId, marketType) {
        var container = document.getElementById(`assets-${categoryId}`);
        var loader = document.getElementById(`loader-${categoryId}`);
        var table = document.getElementById(`table-${categoryId}`);
        
        if (!container) return;
        
        if (loader) loader.style.display = 'block';
        if (table) table.style.display = 'none';
        
        fetch(`{{ url('admin/api/assets') }}/${categoryId}`)
            .then(response => response.json())
            .then(assets => {
                var fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
                
                var html = '';
                assets.forEach(asset => {
                    var value = asset.symbol;
                    var name = asset.name;
                    var imageUrl = asset.image_url || getAssetImage(asset.symbol, marketType);
                    var rowId = `row_${marketType}_${categoryId}_${value.replace('-', '_')}`;
                    
                    var isSelected = isAssetSelectedInOtherCategory(value, categoryId, marketType);
                    if (isSelected) return;
                    
                    var isCurrentlySelected = isAssetSelectedInCurrentCategory(value, categoryId, marketType);
                    var checkedAttr = isCurrentlySelected ? 'checked' : '';
                    
                    html += `<tr id="${rowId}" class="asset-row">
                        <td class="text-center">
                            <input class='form-check-input form-check-input-lg' type='checkbox' name='${fieldName}[${categoryId}][]' value='${value}' id='${marketType}_${categoryId}_${value}' ${checkedAttr} onchange='handleAssetSelection("${value}", "${categoryId}", "${marketType}")'>
                        </td>
                        <td>
                            <div class="d-flex align-items-center">
                                <div class="me-3">
                                    <img src="${imageUrl}" alt="${value}" class="rounded-circle shadow-sm" style="width: 40px; height: 40px; object-fit: cover;" onerror="this.src='https://ui-avatars.com/api/?name=${value.charAt(0)}&size=40&background=667eea&color=fff';">
                                </div>
                                <div>
                                    <div class="fw-bold text-dark">${value}</div>
                                    <small class="text-muted">${name}</small>
                                </div>
                            </div>
                        </td>
                    </tr>`;
                });
                
                container.innerHTML = html;
                
                if (loader) loader.style.display = 'none';
                if (table) table.style.display = 'table';
            })
            .catch(error => {
                console.error('Error loading assets:', error);
                container.innerHTML = '<tr><td colspan="2" class="text-center text-danger"><i class="bi bi-exclamation-triangle me-2"></i>Error loading assets</td></tr>';
                
                if (loader) loader.style.display = 'none';
                if (table) table.style.display = 'table';
            });
    }
    
    function selectTemplateAssets(assetsData, marketType) {
        const fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
        
        console.log('Selecting template assets:', assetsData);
        
        setTimeout(() => {
            Object.keys(assetsData).forEach(categoryName => {
                const assets = assetsData[categoryName];
                if (assets && assets.length > 0) {
                    const categoryId = assets[0].category_id;
                    
                    console.log(`Category: ${categoryName}, ID: ${categoryId}`);
                    
                    assets.forEach(asset => {
                        const assetSymbol = asset.asset_symbol;
                        const checkbox = document.querySelector(`input[name="${fieldName}[${categoryId}][]"][value="${assetSymbol}"]`);
                        if (checkbox) {
                            checkbox.checked = true;
                            checkbox.dispatchEvent(new Event('change'));
                            console.log(`Checked: ${assetSymbol}`);
                        }
                    });
                    
                    setTimeout(() => {
                        updateSelectedCount(categoryId, marketType);
                    }, 100);
                }
            });
        }, 1500);
    }
    
    function isAssetSelectedInOtherCategory(assetValue, currentCategoryId, marketType) {
        var fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
        var allCheckboxes = document.querySelectorAll(`input[name^="${fieldName}["][value="${assetValue}"]:checked`);
        
        for (var i = 0; i < allCheckboxes.length; i++) {
            var checkbox = allCheckboxes[i];
            var checkboxCategoryId = checkbox.name.match(/\[(\d+)\]/)[1];
            if (checkboxCategoryId !== currentCategoryId) {
                return true;
            }
        }
        return false;
    }
    
    function isAssetSelectedInCurrentCategory(assetValue, categoryId, marketType) {
        var fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
        var checkbox = document.querySelector(`input[name="${fieldName}[${categoryId}][]"][value="${assetValue}"]`);
        return checkbox && checkbox.checked;
    }
    
    function handleAssetSelection(assetValue, categoryId, marketType) {
        updateSelectedCount(categoryId, marketType);
        
        setTimeout(function() {
            var categories = document.querySelectorAll('[id^="content-"]');
            categories.forEach(function(categoryDiv) {
                var catId = categoryDiv.id.replace('content-', '');
                if (catId !== categoryId) {
                    loadAssetsForCategory(catId, marketType);
                }
            });
        }, 50);
    }
    
    function updateSelectedCount(categoryId, marketType) {
        var fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
        var selectedCount = document.querySelectorAll(`input[name="${fieldName}[${categoryId}][]"]:checked`).length;
        var countBadge = document.getElementById(`selected-count-${categoryId}`);
        if (countBadge) {
            countBadge.textContent = `${selectedCount} selected`;
            countBadge.className = selectedCount > 0 ? 'badge bg-success fs-6' : 'badge bg-primary fs-6';
        }
    }
    
    function getAssetImage(symbol, marketType) {
        if (marketType === 'stock') {
            return `https://logo.stockanalysis.com/${symbol.toLowerCase()}.svg`;
        } else {
            const cryptoSymbol = symbol.replace('-USD', '').toLowerCase();
            return `https://assets.coincap.io/assets/icons/${cryptoSymbol}@2x.png`;
        }
    }
</script>
@endsection