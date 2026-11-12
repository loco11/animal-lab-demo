/** 页面注册中心：所有路由都在这里登记，未注册的路由会被路由守卫拦回概览 */

import { registerPage } from '../router'
import { hubPage } from './hub'
import { mobilePage } from './mobile'
import { loginPage } from './login'
import { dashboardPage } from './dashboard'
import { servicePage } from './service'
import { internalOrderPage, orderPage } from './order'
import { stockPage } from './stock'
import { purchasePage } from './purchase'
import { supplierPage } from './supplier'
import { feedingPage } from './feeding'
import { cagePage } from './cage'
import { cageBoardPage } from './cageBoard'
import { feePage } from './fee'
import { menuPage } from './menu'
import { rolePage } from './role'
import { userPage } from './user'

registerPage('/hub', { title: '业务全景', render: hubPage })
registerPage('/mobile', { title: '移动办事端', render: mobilePage })
registerPage('/login', loginPage)
registerPage('/dashboard', dashboardPage)
registerPage('/service', servicePage)
registerPage('/order', orderPage)
registerPage('/order/internal', internalOrderPage)
registerPage('/stock', stockPage)
registerPage('/purchase', purchasePage)
registerPage('/supplier', supplierPage)
registerPage('/feeding', feedingPage)
registerPage('/cage/board', cageBoardPage)
registerPage('/cage', cagePage)
registerPage('/fee', feePage)
registerPage('/system/menu', menuPage)
registerPage('/system/role', rolePage)
registerPage('/system/user', userPage)
