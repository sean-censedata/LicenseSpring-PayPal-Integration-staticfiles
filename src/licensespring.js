
/*
minimal data structure for successful order creation on PayPal should be:
{
    purchase_units: [{
        reference_id: "myOrderReferenceId",
        amount: {
            value: "1.5",
            breakdown: {
                item_total: {
                    currency_code: "USD",
                    value: "1.5"
                }
            }
        },
        items: [{
                name: "My product name 1",
                quantity: 1,
                unit_amount: {
                    currency_code: "USD",
                    value: "1"
                }
            },
            {
                name: "My product name 2",
                quantity: 2,
                unit_amount: {
                    currency_code: "USD",
                    value: "0.25"
                }
            }
        ]
    }]
}
however, for successful integration with LicenseSpring using PayPal webhook, use structure below.
note quantity changes and product duplication, as well as using sku attribute to transfer license key.
{
    purchase_units: [{
        reference_id: "myOrderReferenceId",
        amount: {
            value: "1.5",
            breakdown: {
                item_total: {
                    currency_code: "USD",
                    value: "1.5"
                }
            }
        },
        items: [{
                name: "My product name 1",
                quantity: 1,
                unit_amount: {
                    currency_code: "USD",
                    value: "1"
                },
                sku: "secret_data",

            },
            {
                name: "My product name 2",
                quantity: 1,
                unit_amount: {
                    currency_code: "USD",
                    value: "0.25"
                },
                sku: "secret_data",
            },
            {
                name: "My product name 2",
                quantity: 1,
                unit_amount: {
                    currency_code: "USD",
                    value: "0.25"
                },
                sku: "secret_data",
            }
        ]
    }]
}
*/
 
class LicenseSpring {

  constructor(showErrors = false) {
    this.showErrors = showErrors;
    
    // licenses from backend
    this.licenses = [];

    // load stylesheet
    let css = document.createElement("link")
    css.setAttribute("rel", "stylesheet")
    css.setAttribute("type", "text/css")
    css.setAttribute("href", "http://static.kraken.epa.hr/licensespring/licensespring.css")
    document.head.appendChild(css)
  }

  /*
    creates valid JSON for PayPal order creation.
    PayPal uses 2 decimal points (https://developer.paypal.com/docs/api/reference/currency-codes/).
  */
  generatePayPalOrder = (orderReferenceId, currency, products) => {
    let items = [],
        sum = 0;
    products.forEach(item => {
      // dont check if price is undefined - PayPal will scream about that
      const itemPrice = item.price ? item.price.toFixed(2) : item.price;
      items.push({
          ...item,
          unit_amount: {
              currency_code: currency,
              value: itemPrice,
          },
      });
      sum += itemPrice * parseInt(item.quantity);
    });
    sum = sum.toFixed(2);

    return {
        purchase_units: [{
            reference_id: orderReferenceId,
            amount: {
                value: sum,
                breakdown: {
                    item_total: {
                        currency_code: currency,
                        value: sum,
                    }
                }
            },
            items,
        }]
    };
  }

  /*
    check if products have following parameters: name, quantity, code.
    those are needed for successfull license and order creation in LicenseSpring.
  */
  checkProductsProperties = (orderData) => {
    if (!("purchase_units" in orderData)) {
      throw new Error("Purchase_units object must be present in PayPal order data");
    }
    if (orderData.purchase_units.length < 1) {
      throw new Error("Purchase units must have one element");
    }
    if (!("items" in orderData.purchase_units[0])) {
      throw new Error("Items object must be present in purchase_units object in PayPal order data");
    }
    orderData.purchase_units[0].items.forEach(item => {
      if (!("name" in item)) {
        throw new Error("Product must have a name property");
      }
      if (!("quantity" in item)) {
        throw new Error("Product must have a quantity property");
      }
      if (!("code" in item)) {
        throw new Error("Product must have a code property");
      }
    });
  }

  /*
    throws error in case of problem with presented data or backend error.
    PayPal order creation will not proceed if this fails.
  */
  getLicensesFromBackend = (orderData, url, functionToExecute) => {
    this.checkProductsProperties(orderData);

    return fetch(url, {
      method: "post",
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    }).then(res => res.json())
      .then(res => {
        if (res.success) {
          return functionToExecute(JSON.parse(res.message));
        } else {
          this.displayError(res.message);
        }
      });
  }

  /*
    used for direct integration (without paypal webhook) - prefered way.
  */
  acquireLicenses = (orderData, url) => {
    return this.getLicensesFromBackend(orderData, url, (data) => {
      this.licenses = data;
    });
  }

  /*
    used for integration with paypal webhook - not used yet.
    encodes licenses inside order data.
    each item reduced to quantity 1, with a license key.
  */
  encodeLicensesInOrderData = (orderData, url) => {
    return this.getLicensesFromBackend(orderData, url, (data) => {
      let newItems = [],
          i;
    
      data.purchase_units[0].items.forEach(item => {
          const { licenses, code, ...interestingProps } = item;
          for (i = 0; i < parseInt(item.quantity); i++) {
            newItems.push({
                  ...interestingProps,
                  quantity: 1,
                  sku: btoa(item.code + ";" + item.licenses[i]),
              });
          }
      });
      data.purchase_units[0].items = newItems;
      return data;
    });
  }

  /*
    used for direct integration (without paypal webhook) - prefered way.
    on finish, either show license keys or displays error.
  */
  createOrder = (details, url) => {
    const licenses = this.licenses;

    fetch(url, {
      method: "post",
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ licenses, details })
    }).then(res => res.json())
      .then(res => {
        if (res.success) {
          this.displayLicenseKeys();
        } else {
          this.displayError(res.message);
        }
      })
      .catch(e => {
        this.displayError(e);
      });
  }



  addNewElementToParent = (tag, parent, innerHTML = null, className = tag) => {
    const classNamePrepend = "licensespring-",
        element = document.createElement(tag);

    element.classList.add(classNamePrepend + className);
    element.innerHTML = innerHTML;
    parent.appendChild(element);
    return element;
  }

  createLSPopupContainer = (title, msg) => {
    const wrapper = this.addNewElementToParent("div", document.body, null, "wrapper"),
      container = this.addNewElementToParent("div", wrapper, null, "container"),
      closeButton = this.addNewElementToParent("a", container, "&times;", "close"),
      header = this.addNewElementToParent("h2", container, title),
      para = this.addNewElementToParent("p", container, msg);
    return container;
  }

  /*
    if easyClose is true, user can click outside of popup to close.
    otherwise only click on Close button will close it.
  */
  registerPopupCloseListener = (easyClose = false) => {
    document.addEventListener("click", function _listener(e) {
      const clickableElements = easyClose ? ["licensespring-wrapper", "licensespring-close"] : ["licensespring-close"];

      if (clickableElements.includes(e.target.className)) {
          document.querySelectorAll(".licensespring-wrapper")[0].style.display = "none";
          document.removeEventListener("click", _listener);
      }
    });
  }

  /*
    displays popup on screen (if set) and throw error.
  */
  displayError = errorMsg => {
    if (this.showErrors) {
      this.createLSPopupContainer("There has been an error", errorMsg);
      this.registerPopupCloseListener(true); 
    }
    throw new Error(errorMsg);
  }

  displayLicenseKeys = () => {
    const container = this.createLSPopupContainer("Thank you for your purchase", "Here are your licenses:"),
        table = this.addNewElementToParent("div", container, null, "table"),
        row = this.addNewElementToParent("div", table, null, "row"),
        span1 = this.addNewElementToParent("span", row, "Product", "product-name-header"),
        span2 = this.addNewElementToParent("span", row, "License", "product-name-header");

    const myself = this;
    this.licenses.forEach(function ({ name, licenses }) {
        licenses.forEach(license => {
          const license_row = myself.addNewElementToParent("div", table, null, "row"),
            license_span1 = myself.addNewElementToParent("span", license_row, name, "product-name"),
            license_span2 = myself.addNewElementToParent("span", license_row, license, "product-license");
        });
    });

    this.registerPopupCloseListener();
  }
}
