##################### EX-UI Start Script #####################
# Authors: Antonio Steiger antonio.steiger@tum.de
#
# Purpose:  Parse equipment configuration and start all
#           necessary containers as well as the OpenMCT
#           WebServer
# Important:
#
# Approach: - PySide2 for starrt screen, file dialogue and 
#             progress bar
#           - PyYAML parsing for dynamically creating 
#           - docker-compose.yaml
# Based on: - https://github.com/Wanderson-Magalhaes/Splash_Screen_Python_PySide2
#           - https://gist.github.com/MalloyDelacroix/2c509d6bcad35c7e35b1851dfc32d161
#           - 
# Roadmap:  - TODO: Document start process in a log file
#           - TODO: Fix progress bar

import os
import sys
import subprocess as sh
from threading import Thread, Event

from PySide6 import QtCore, QtSvgWidgets
from PySide6.QtCore import (QMetaObject, QObject, QRect, QSize, Qt, Signal)
from PySide6.QtGui import (QColor, QFont, QScreen)
from PySide6.QtWidgets import *

import json
from yaml import safe_dump_all
import socket
from paramiko.client import SSHClient as ssh
from paramiko import AutoAddPolicy, ssh_exception

import netifaces

from datetime import datetime

### ENVIRONMENT ###
EXUIUSR = "exui"
EXUIPW = "exui"
IP = ""
EQFILEMOUNTPT = '/eqconfig'
CERTMOUNT = '/cert'
KEYMOUNT = '/key'
REGISTRYLOCATION = '127.0.0.1:5000' # this is defined by install.py
INTERNAL_WEBSERVERPORT = 8080
EXTERNAL_WEBSERVERPORT = 443 # Allows to leave out port number after exui.de address
ADAPTERPORT = 9100
ADAPTERFOLDER = './adapters/'
CERTFOLDER = './certs/'
BINDFOLDER = './Bind9'
MAPFOLDER = './mapserver/mapserver:/data'
PROXYFOLDER = './apache_proxy' 
MAPSTYLEFILE = './mapserver/mapserver/styles/basic.json'
MAPCONFFILE = './mapserver/mapserver/config.json'

ADAPTERLIST = [ # REGISTER NEW ADAPTERS HERE
    'tcp',
    'opcua',
    'serial',
    'video',
    'benchmark',
    'locat2d',
    'locat3d',
    'orien3d',
    'aprs',
    'netdata',
]

SPECIALDATADICT = {# REGISTER NEW SPECIAL DATA TYPES THAT NEED
    'gps': ['locat2d', 'locat3d'], # THEIR OWN ADAPTERS HERE
    'orientation': ['orient3d'],
    'Wasserfall': ['locat1d']
}

DOCKERFILENAME = "Dockerfile"

USENETDATA = False # Default is false due to performance hits
USEDNS = True
USEMAPSERVER = False
USEVIDEO = False
USEPORTAINER = True

### GLOBAL VARS ###
progressValue = 0
EQPATH = ""
EQCONFIG = {}


### UI CLASSES ###
class UI_ProgressScreen(object):
    def setupUi(self, SplashScreen, width, height):
        if SplashScreen.objectName():
            SplashScreen.setObjectName(u"SplashScreen")

        self.centralwidget = QWidget(SplashScreen)
        self.centralwidget.setObjectName(u"centralwidget")

        self.verticalLayout = QVBoxLayout(self.centralwidget)
        self.verticalLayout.setSpacing(0)
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.verticalLayout.setContentsMargins(10, 10, 10, 10)
        
        self.dropShadowFrame = QFrame(self.centralwidget)
        self.dropShadowFrame.setObjectName(u"dropShadowFrame")
        self.dropShadowFrame.setStyleSheet(u"QFrame {	\n"
            "	background-color: rgb(57, 57, 57);	\n"
            "	color: rgb(220, 220, 220);\n"
            "	border-radius: 10px;\n"
            "}") # OpenMCT colors
        self.dropShadowFrame.setFrameShape(QFrame.StyledPanel)
        self.dropShadowFrame.setFrameShadow(QFrame.Raised)

        # EX-UI Logo
        self.label_title = QtSvgWidgets.QSvgWidget(self.dropShadowFrame, "./resources/logos/exui_logo.svg")
        self.label_title.load("./resources/logos/exui_logo.svg")
        self.label_title.setGeometry(QRect(0.3 * width - 10, 0.1 * height, 0.4 * width, 0.15 * height))

        self.label_description = QLabel(self.dropShadowFrame)
        self.label_description.setObjectName(u"label_description")
        self.label_description.setGeometry(QRect(0, 0.6 * height, width - 10, 0.05 * height))
        self.label_description.setText("Starting")
        font1 = QFont()
        font1.setFamily(u"Segoe UI")
        font1.setPointSize(14)
        self.label_description.setFont(font1)
        self.label_description.setStyleSheet(u"color: rgb(190, 190, 190);")
        self.label_description.setAlignment(Qt.AlignCenter)
        
        self.progressBar = QProgressBar(self.dropShadowFrame)
        self.progressBar.setObjectName(u"progressBar")
        self.progressBar.setGeometry(QRect(0.05 * width - 10, 0.5 * height, 0.9 * width, 0.05 * height))
        self.progressBar.setAlignment(Qt.AlignCenter)
        self.progressBar.setStyleSheet(u"QProgressBar {\n"
            "	\n"
            "	background-color: #9bdafa;\n"
            "	border-style: none;\n"
            "	border-radius: 10px;\n"
            "	text-align: center;\n"
            "   color: #ffffff;\n"
            "}\n"
            "QProgressBar::chunk{\n"
            "	border-radius: 10px;\n"
            "	background-color: qlineargradient(spread:pad, x1:0, y1:0.5, x2:1, y2:0.5, stop:0 rgba(250, 142, 62, 255), stop:0.323529 rgba(125, 73, 151, 255), stop:0.593137 rgba(7, 97, 176, 255), stop:0.828431 rgba(106, 178, 225, 255), stop:1 rgba(155, 218, 250, 255));\n"
            "}") # EX-UI logo colors
        self.progressBar.setFont(font1)
        self.progressBar.setValue(0)
        
        self.label_credits = QLabel(self.dropShadowFrame)
        self.label_credits.setObjectName(u"label_credits")
        self.label_credits.setGeometry(QRect(-10, 0.85 * height, width, 0.05 * height))
        font3 = QFont()
        font3.setFamily(u"Segoe UI")
        font3.setPointSize(10)
        self.label_credits.setFont(font3)
        self.label_credits.setStyleSheet(u"color: rgb(120, 120, 120);") #OpenMCT Color
        self.label_credits.setAlignment(Qt.AlignCenter)
        self.label_credits.setText("EX-UI Start Application Version 1.0.  Authors: Antonio Steiger")

        self.verticalLayout.addWidget(self.dropShadowFrame)

        SplashScreen.setCentralWidget(self.centralwidget)

        QMetaObject.connectSlotsByName(SplashScreen)



class UI_StartScreen(object):
    def setupUi(self, StartScreen, width, height):
        if StartScreen.objectName():
            StartScreen.setObjectName(u"StartScreen")

        self.centralwidget = QWidget(StartScreen)
        self.centralwidget.setObjectName(u"centralwidget")

        self.verticalLayout = QVBoxLayout(self.centralwidget)
        self.verticalLayout.setSpacing(0)
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.verticalLayout.setContentsMargins(10, 10, 10, 10)

        self.dropShadowFrame = QFrame(self.centralwidget)
        self.dropShadowFrame.setObjectName(u"dropShadowFrame")
        self.dropShadowFrame.setStyleSheet(u"QFrame {	\n"
            "	background-color: rgb(57, 57, 57);	\n"
            "	color: rgb(220, 220, 220);\n"
            "	border-radius: 10px;\n"
            "}") # OpenMCT colors
        self.dropShadowFrame.setFrameShape(QFrame.StyledPanel)
        self.dropShadowFrame.setFrameShadow(QFrame.Raised)

        # EX-UI Logo
        self.label_title = QtSvgWidgets.QSvgWidget(self.dropShadowFrame, "./resources/logos/exui_logo.svg")
        self.label_title.load("./resources/logos/exui_logo.svg")
        self.label_title.setGeometry(QRect(0.3 * width - 20, 0.1 * height, 0.4 * width, 0.15 * height))

        # Select File Button
        self.filebutton = QPushButton("Select File...", self.dropShadowFrame)
        self.filebutton.setGeometry(QRect(0.2 * width - 10, 0.6 * height, 0.15 * width, 0.05 * height))
        self.filebutton.clicked.connect(StartScreen.showFileDialog)
        self.filebutton.setStyleSheet("""
            QPushButton {
                color: white;
                background-color: #0761b0; 
                border-radius: 10px;
            }
            QPushButton:hover {
                background-color: #6ab2e1;
            }
            QPushButton:pressed {
                background-color: #FA8E3E;
            }
            """)
        
        # Description next to file select button
        self.filebuttonlabel = QLabel(self.dropShadowFrame)
        font = QFont()
        font.setFamily(u"Segoe UI")
        font.setPointSize(13)
        self.filebuttonlabel.setFont(font)
        self.filebuttonlabel.setStyleSheet(u"color: rgb(190, 190, 190);")
        self.filebuttonlabel.setGeometry(0.36 * width - 10, 0.6 * height, 0.6 * width, 0.05 * height)
        self.filebuttonlabel.setText("Choose Equipment Configuration File")

        # Credits, Version
        self.label_credits = QLabel(self.dropShadowFrame)
        self.label_credits.setObjectName(u"label_credits")
        self.label_credits.setGeometry(QRect(-10, 0.85 * height, width, 0.05 * height))
        font3 = QFont()
        font3.setFamily(u"Segoe UI")
        font3.setPointSize(10)
        self.label_credits.setFont(font3)
        self.label_credits.setStyleSheet(u"color: rgb(120, 120, 120);")
        self.label_credits.setAlignment(Qt.AlignCenter)
        self.label_credits.setText("EX-UI Start Application Version 1.0.  Authors: Antonio Steiger")
        
        self.verticalLayout.addWidget(self.dropShadowFrame)
        StartScreen.setCentralWidget(self.centralwidget)

        QMetaObject.connectSlotsByName(StartScreen)

class UI_IPScreen(object):
    def setupUi(self, StartScreen, width, height):
        if StartScreen.objectName():
            StartScreen.setObjectName(u"StartScreen")

        self.centralwidget = QWidget(StartScreen)
        self.centralwidget.setObjectName(u"centralwidget")

        self.verticalLayout = QVBoxLayout(self.centralwidget)
        self.verticalLayout.setSpacing(0)
        self.verticalLayout.setObjectName(u"verticalLayout")
        self.verticalLayout.setContentsMargins(10, 10, 10, 10)

        self.dropShadowFrame = QFrame(self.centralwidget)
        self.dropShadowFrame.setObjectName(u"dropShadowFrame")
        self.dropShadowFrame.setStyleSheet(u"QFrame {	\n"
            "	background-color: rgb(57, 57, 57);	\n"
            "	color: rgb(220, 220, 220);\n"
            "	border-radius: 10px;\n"
            "}") # OpenMCT colors
        self.dropShadowFrame.setFrameShape(QFrame.StyledPanel)
        self.dropShadowFrame.setFrameShadow(QFrame.Raised)

        # EX-UI Logo
        self.label_title = QtSvgWidgets.QSvgWidget(self.dropShadowFrame, "./resources/logos/exui_logo.svg")
        self.label_title.load("./resources/logos/exui_logo.svg")
        self.label_title.setGeometry(QRect(0.3 * width - 20, 0.1 * height, 0.4 * width, 0.15 * height))

        # Credits, Version
        self.label_credits = QLabel(self.dropShadowFrame)
        self.label_credits.setObjectName(u"label_credits")
        self.label_credits.setGeometry(QRect(-10, 0.85 * height, width, 0.05 * height))
        font3 = QFont()
        font3.setFamily(u"Segoe UI")
        font3.setPointSize(10)
        self.label_credits.setFont(font3)
        self.label_credits.setStyleSheet(u"color: rgb(120, 120, 120);")
        self.label_credits.setAlignment(Qt.AlignCenter)
        self.label_credits.setText("EX-UI Start Application Version 1.0.  Authors: Antonio Steiger")
        
        self.verticalLayout.addWidget(self.dropShadowFrame)
        StartScreen.setCentralWidget(self.centralwidget)

        QMetaObject.connectSlotsByName(StartScreen)


### WINDOW CLASSES ###
class ProgressScreen(QMainWindow):
    def __init__(self, xsize, ysize):
        QMainWindow.__init__(self)
        self.ui = UI_ProgressScreen()
        self.ui.setupUi(self, width=xsize, height=ysize)

        self.setWindowTitle("EX-UI")

        self.setFixedSize(QSize(xsize, ysize))
        # Center Window on screen
        center = QScreen.availableGeometry(QApplication.primaryScreen()).center()
        geo = self.frameGeometry()
        geo.moveCenter(center)
        self.move(geo.topLeft())

        # Remove Title Bar
        self.setWindowFlag(QtCore.Qt.FramelessWindowHint)
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)

        # Drop Shadow Effect
        self.shadow = QGraphicsDropShadowEffect(self)
        self.shadow.setBlurRadius(20)
        self.shadow.setXOffset(0)
        self.shadow.setYOffset(0)
        self.shadow.setColor(QColor(0, 0, 0, 60))
        self.ui.dropShadowFrame.setGraphicsEffect(self.shadow)

class StartScreen(QMainWindow):
    # Signal for switching to next window
    switch_window = Signal()
    
    def __init__(self, xsize, ysize):
        super().__init__()
        self.ui = UI_StartScreen()
        self.ui.setupUi(self, width=xsize, height=ysize)
        
        self.setWindowTitle("EX-UI")

        self.setFixedSize(QSize(xsize, ysize))
        # Center Window on screen
        center = QScreen.availableGeometry(QApplication.primaryScreen()).center()
        geo = self.frameGeometry()
        geo.moveCenter(center)
        self.move(geo.topLeft())

        #Remove Title Bar
        self.setWindowFlag(QtCore.Qt.FramelessWindowHint)
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)

        # # Drop Shadow Effect
        self.shadow = QGraphicsDropShadowEffect(self)
        self.shadow.setBlurRadius(20)
        self.shadow.setXOffset(0)
        self.shadow.setYOffset(0)
        self.shadow.setColor(QColor(0, 0, 0, 60))

    def transform(self, text):
        return QObject.tr(text)

    def showFileDialog(self):
        global EQPATH
        filewindow = QMainWindow()
        #filewindow.setCentralWidget(centralwidget)
        #filewindow.show()
        EQPATH, _ = QFileDialog.getOpenFileName(filewindow, self.transform("Load Equipment Configuration"), 
                            self.transform("."), self.transform("JSON Files (*.json)"))
        filewindow.close()
        # Only transition to start process with progress screen if non null string is returned
        if(EQPATH != ""):
            self.switch_window.emit()

class IPScreen(QMainWindow):
    # Signal for switching to next window
    sw_win = Signal()
    
    def __init__(self, xsize, ysize):
        super().__init__()
        self.ui = UI_IPScreen()
        self.ui.setupUi(self, width=xsize, height=ysize)
        
        self.setWindowTitle("EX-UI")

        self.setFixedSize(QSize(xsize, ysize))
        # Center Window on screen
        center = QScreen.availableGeometry(QApplication.primaryScreen()).center()
        geo = self.frameGeometry()
        geo.moveCenter(center)
        self.move(geo.topLeft())

        #Remove Title Bar
        self.setWindowFlag(QtCore.Qt.FramelessWindowHint)
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)

        # # Drop Shadow Effect
        self.shadow = QGraphicsDropShadowEffect(self)
        self.shadow.setBlurRadius(20)
        self.shadow.setXOffset(0)
        self.shadow.setYOffset(0)
        self.shadow.setColor(QColor(0, 0, 0, 60))

    def transform(self, text):
        return QObject.tr(text)

    def showIPDialog(self, ip_list):
        global IP
        item, ok = QInputDialog().getItem(self, "Choose IP Address",
            "Please choose your network interface.", ip_list, 1, False)
        ip = item.split(">")[1]
        print(ip)
        IP = ip
        self.sw_win.emit()



class WindowController():
    def __init__(self, xsize, ysize):
        self.xsize = xsize
        self.ysize = ysize
    
    def showStartScreen(self):
        self.startScreen = StartScreen(self.xsize, self.ysize)
        self.startScreen.show()
        self.startScreen.switch_window.connect(self.showIPScreen)

    def showIPScreen(self):
        self.startScreen.close()
        self.IPScreen = IPScreen(self.xsize, self.ysize)
        self.IPScreen.show()
        ip_list = ip4_addresses()
        self.IPScreen.sw_win.connect(self.showProgressScreen)
        self.IPScreen.showIPDialog(ip_list)
        #self.IPScreen.sw_win.connect(self.showProgressScreen)

    def showProgressScreen(self):
        global progressValue
        
        print("progress screen")
        self.IPScreen.close()
        self.progressScreen = ProgressScreen(self.xsize, self.ysize)
        self.progressScreen.show()
        
        progressEvent = Event()
        th = Thread(target=mainStart, args=(progressEvent,))
        th.start()
        # Thread is blocking for some reason at the moment.
        
        progressEvent.wait()
        self.progressScreen.ui.progressBar.setValue(progressValue)
        self.progressScreen.ui.label_description.setText("✔ Parsed equipment configuration.")
        progressEvent.clear()

        th.join()
        
        self.progressScreen.ui.progressBar.setValue(100)
        self.progressScreen.ui.label_description.setText("✔ Start Complete. Closing in 5s.")
        # Close start application after 5s
        QtCore.QTimer.singleShot(5000, self.progressScreen.close)



### CLASSES ###
class DockerService():
    def __init__(self, type, initialPort, tasknumber,name):
        global EQFILEMOUNTPT
        global REGISTRYLOCATION
        global ADAPTERFOLDER
        global ADAPTERPORT
        global DOCKERFILENAME

        self.yaml = {
            'image': '',
            'build': {
                'context': '',
                'dockerfile': ''
            },
            'container_name': str(name),
            'deploy':{
                'replicas': 1,
                'placement':{
                    'max_replicas_per_node': 1
                }
            },
            'ports': [],
            'tty': True,    
            'configs': []
        }
        if (initialPort):
            self.yaml['ports'].append(str(initialPort) + "-" + str(initialPort) + ":" + str(ADAPTERPORT))

        self.yaml['build']['context'] = ADAPTERFOLDER + type
        
        if type.casefold() == "web" or type.casefold() == "webserver":
            self.yaml["build"]["context"] = "./webserver"
            self.yaml["ports"][0] = str(EXTERNAL_WEBSERVERPORT) + ":" + str(INTERNAL_WEBSERVERPORT)
        else:
            self.yaml["entrypoint"] = [
                "/bin/sh",
                "start.sh"
            ]
            self.yaml["environment"] = {
                "TASKID": str(tasknumber)
            }

        self.yaml['image'] = REGISTRYLOCATION + '/exui_' + type
        self.yaml['build']['dockerfile'] = DOCKERFILENAME
        self.yaml['configs'].append(EQFILEMOUNTPT.strip('/'))
        self.yaml['configs'].append(CERTMOUNT.strip('/'))
        self.yaml['configs'].append(KEYMOUNT.strip('/'))

        self.portrange = [initialPort, initialPort]

    def exposeSourcePortTCP(self,sourcePort,intPort):
        self.yaml['ports'].append(str(sourcePort) + ":" + str(intPort))

    def exposeSourcePortUDP(self,sourcePort):
        self.yaml['ports'].append(str(sourcePort) + ":" + str(sourcePort) + "/udp")

    def increaseReplicas(self,amount):
        self.yaml['deploy']['replicas'] = amount

    def getYAML(self):
        return self.yaml

    def deploiment_global(self):
        self.yaml['deploy'].clear()
        self.yaml['deploy']['mode'] = 'global'

def linux_init_swarm(ip):
    process = sh.Popen(["docker","swarm", "init", "--advertise-addr", str(ip)])
    process.wait()


def linux_createDockerRegistry():
    process =   sh.Popen(["docker", "service", "create", "--name", "registry",
                    "--publish", "5000:5000", "registry:2"])
    process.wait()
    # TODO: suppress error msg if registry already exists

class DNSCONFIG():
    global CERTFOLDER
    global BINDFOLDER
    global EQCONFIG

    def __init__(self):
        now = datetime.now()
        self.nameconftext = ""
        self.nameconftext += "acl internal{\n"
        for ip in EQCONFIG["DNS"]["internal-ips"]:
            self.nameconftext += ip +';\n'
        self.nameconftext += "};\n"
        self.nameconftext += "options{\nforwarders{\n"
        for forward in EQCONFIG["DNS"]["forwarders"]:
            self.nameconftext += forward + ";\n"
        self.nameconftext += "};\nallow-query{\ninternal;\n};\n};\n\n"
        self.nameconftext += "zone \""+EQCONFIG["DNS"]["maindomain"]+"\" IN { \n type master;\n file "
        self.nameconftext += "\"etc/bind/"+EQCONFIG["DNS"]["maindomain"]+".zone\";\n};\n"
        
        self.zoneconftxt = "$TTL 2d\n\n"
        self.zoneconftxt += "$ORIGIN "+EQCONFIG["DNS"]["maindomain"]+".\n\n"
        self.zoneconftxt += "@ IN SOA ns."+EQCONFIG["DNS"]["maindomain"]+". "+EQCONFIG["DNS"]["email"].replace("@",".")+".(\n"
        self.zoneconftxt += now.strftime("%Y%m%d") +"\n12H\n15m\n3w\n2h\n)\n"
        self.zoneconftxt += "    IN NS ns."+EQCONFIG["DNS"]["maindomain"]+".\n"
        self.zoneconftxt += "ns  IN  A "+EQCONFIG["computers"][0]["ip"]+"\n\n\n"
        subdomain = "@"
        challenge = "_acme-challenge"
        if EQCONFIG["DNS"]["subdomain"] != "":
            subdomain = EQCONFIG["DNS"]["subdomain"] 
            challenge += "." + subdomain
        for computer in EQCONFIG["computers"]:
            self.zoneconftxt += subdomain + "   IN  A "+ computer["ip"]+";\n"
        self.zoneconftxt += challenge + " IN TXT "+ EQCONFIG["DNS"]["_acme-challenge"]+";\n"

        #self.zoneconfig = open(BINDFOLDER + "/config/"+EQCONFIG["DNS"]["maindomain"]+".zone", "w")

    def writenameconf(self):
        self.nameconfig = open(BINDFOLDER + "/config/named.conf", "w")
        self.nameconfig.write(self.nameconftext)
        self.nameconfig.close()

    def writenamezone(self):
        self.zoneconfig = open(BINDFOLDER + "/config/"+EQCONFIG["DNS"]["maindomain"]+".zone", "w")
        self.zoneconfig.write(self.zoneconftxt)
        self.zoneconfig.close()

    def getnameconfig(self):
        return self.nameconftext

    def getzoneconfig(self):
        return self.zoneconftxt

class ProxyConfig ():
    
    def __init__(self,ports, redirectdomain,):
        self.redirectconf = ""
        self.redirectconf += "<VirtualHost *:"+ports+">\n"
        if (EQCONFIG["DNS"]["subdomain"] != ""):
            self.redirectconf += "\t\tServerName " + EQCONFIG["DNS"]["subdomain"] +"."+EQCONFIG["DNS"]["maindomain"] +"\n"
        else:
            self.redirectconf += "\t\tServerName " + EQCONFIG["DNS"]["maindomain"] +"\n"
        self.redirectconf+= "\t\tSSLEngine On\n"
        self.redirectconf+= "\t\tSSlCertificateFile /cert\n"
        self.redirectconf+= "\t\tSSLCertificateKeyFile /key\n"
        self.redirectconf+= "\tSSLProxyEngine on\n"
        self.redirectconf+= "\t<Location />\n"
        self.redirectconf+= "\t\tProxyPass "+ redirectdomain +"\n"
        self.redirectconf+= "\t\tProxyPassReverse " + redirectdomain +"\n"
        self.redirectconf+= "\t </Location>\n"
        self.redirectconf+= "</VirtualHost>"

    def writeconf(self,filename):
        self.conffile = open(PROXYFOLDER + '/' + filename,"w")
        self.conffile.write(self.redirectconf)
        self.conffile.close()




### FUNCTIONS ###
def mainStart(progressEvent):
    global progressValue
    
    # TODO:
    # Progress bar currently not functional. Likely due to mainStart 
    # blocking main rendering loop although it is launched in a thread
    print("Starting...")
    parseEqConfig()
    progressValue = 5
    progressEvent.set()

    progressValue = 10
    progressEvent.set()


    linux_init_swarm(IP)

    linux_createDockerRegistry()

    
    configureDNSserver()

        
    managertoken, workertoken = initDockerSwarm(IP)
    progressValue = 15
    progressEvent.set()
    
    addSwarmNodes(managertoken, workertoken, IP)
    # progressValue = 25
    # progressEvent.set()dfgdfg

    createDockerCompose()
    # progressValue = 35
    # progressEvent.set()

    buildDockerCompose()
    # progressValue = 75
    # progressEvent.set()

    pushDockerCompose()
    # progressValue = 85
    # progressEvent.set()

    dockerStackDeploy()
    # progressValue = 100
    # progressEvent.set()

def writeProxyConfig( port, url, datei):
    mapproxy = ProxyConfig(port, url)
    mapproxy.writeconf(datei)

def configureDNSserver():
    if (os.path.exists(CERTFOLDER)):
        dns = DNSCONFIG()
        try:
            dns.writenameconf()
            dns.writenamezone()
        except:
            print("couldn't find the Folder for BIND9 config")
            print("Try running install.py again")
            sys.exit()
    else:
        print("The domain you wished could not be hadled't because no certificates/ keys are found at" + CERTFOLDER)
        print("switch to one that is already available or have a look at the wiki on how to create a new one")
        sys.exit()

def parseEqConfig():
    global EQPATH
    global EQCONFIG
    global CERTFOLDER
    global USEDNS
    global USEMAPSERVER
    global USEVIDEO

    try:
        eqfile = open(EQPATH)
        EQCONFIG = json.load(eqfile)

    except OSError:
        print("Could not open eq config file " + EQPATH +" Maybe it is in a protected directory?")
        sys.exit(1) #TODO show error in UI and allow to try again
    except json.JSONDecodeError:
        print("Error parsing equipment configuration!")
        sys.exit(1) # TODO show error in UI and allow to try again

    #update the specified certfolder to use
    if(EQCONFIG["DNS"]["subdomain"]!=""):
        CERTFOLDER += EQCONFIG["DNS"]["subdomain"] + "."
    CERTFOLDER += EQCONFIG["DNS"]["maindomain"]

    #set if mapserver and dns should be used
    if (EQCONFIG['DNS']['useHTTPS'] != "True"):
        USEDNS = False
    if (EQCONFIG['map']['useLocalMapserver'] == "True"):
        USEMAPSERVER = True
        try:
            stylefile = open(MAPSTYLEFILE)
            STYLE = json.load(stylefile)
            mconffile = open(MAPCONFFILE)
            MAPCONF = json.load(mconffile)
        except OSError:
            print("Could not open stilefile file " + MAPSTYLEFILE + " or "+ MAPCONFFILE + "Maybe it is in a protected directory?")
            sys.exit(1) #TODO show error in UI and allow to try again
        except json.JSONDecodeError:
            print("Error parsing stylefile configuration!")
        STYLE["sources"]["mapbox"]["url"] = "mbtiles://"+EQCONFIG["map"]["MapFileName"]
        MAPCONF["styles"]["basic"]["tilejson"]["bounds"] = EQCONFIG["map"]["Bounds"]

        try:
            stylefile = open(MAPSTYLEFILE, "w")
            mconffile = open(MAPCONFFILE, 'w')
            json.dump(STYLE, stylefile , indent=4)
            json.dump(MAPCONF, mconffile, indent=4)
        except OSError:
            print("Could not open eq config file " + MAPCONFFILE +" or " + MAPSTYLEFILE +" Maybe it is in a protected directory?")
            sys.exit(1) #TODO show error in UI and allow to try again
    if (EQCONFIG['Video']):
        USEVIDEO = True

    EQCONFIG["computers"][0]["ip"] = ""+IP

    # Overwrite the eqconfig:
    try:
        eqfile = open(EQPATH, "w")
        json.dump(EQCONFIG, eqfile, indent=4)
    except OSError:
        print("Could not open eq config file " + EQPATH +" Maybe it is in a protected directory?")
        sys.exit(1) #TODO show error in UI and allow to try again

def ip4_addresses():
    ip_list = []
    for interface in netifaces.interfaces():
        str = ""
        if 2 in netifaces.ifaddresses(interface):
            if interface.startswith("br") or interface.startswith("docker"):
                continue
            addr = netifaces.ifaddresses(interface)[2][0]['addr']
            ip_list.append(interface + "-->" + addr)
    return ip_list

def initDockerSwarm(ip):
    managertoken = workertoken = ""
    
    try:
        # try to get join tokens
        workertoken = sh.check_output(['docker', 'swarm', 'join-token', 
                        '-q', 'worker'])
        managertoken = sh.check_output(['docker', 'swarm', 'join-token', 
                        '-q', 'manager'])
    except sh.CalledProcessError:
        # except swarm is not initialized
        try:
            # Initialize swarm
            sh.check_output(['docker', 'swarm', 'init', 
                '--advertise-addr', str(ip)])
            workertoken = sh.check_output(['docker', 'swarm', 'join-token', 
                                '-q', 'worker'])
            managertoken = sh.check_output(['docker', 'swarm', 'join-token', 
                                '-q', 'manager'])
        except sh.CalledProcessError:
            # Some unexpected error occured
            print("ERROR: Could not initialize docker swarm.")
            sys.exit()
    
    managertoken = managertoken.decode().strip('\n')
    workertoken = workertoken.decode().strip('\n')

    return managertoken, workertoken

def addSwarmNodes(managertoken, workertoken, ip):
    for pc in EQCONFIG["computers"]:
        if pc["ip"] != ip:
            session = ssh()
            session.set_missing_host_key_policy(AutoAddPolicy())
            # Connect to computer's ssh
            try:
                session.connect(pc["ip"], username=EXUIUSR, password=EXUIPW)
            except ssh_exception.AuthenticationException:
                print("ERROR: Adding computer " + pc["name"] + " with ip " + pc["ip"] + 
                    " failed. Did you run install.py on that pc?")
                sys.exit()
            # Add it to swarm
            try:
                if pc["type"] == "worker":
                    stdin, stdout, stderr =  session.exec_command("docker swarm join --token " + workertoken + " " + ip + ":2377")
                    #stdin, stdout, stderr = session.exec_command("echo $USER")
                elif pc["type"] == "manager":
                    stdin, stdout, stderr =  session.exec_command("docker swarm join --token " + managertoken + " " + ip + ":2377")
                elif pc["type"] == "manager-only":
                    stdin, stdout, stderr =  session.exec_command("docker swarm join --token " + managertoken + "--availability drain " + ip + ":2377")
                exitcode = stdout.channel.recv_exit_status()
                
                if exitcode != 0:
                    print("ERROR: Swarm join command could not be run on pc \"" +
                    pc["name"] + "\".")
                    #sys.exit(1)

            except ssh_exception.SSHException:
                print("ERROR: Swarm join command could not be run on pc \"" +
                    pc["name"] + "\".")
                sys.exit(1)

            session.close()

def createDockerCompose():
    initiateProxyDocker()
    global EQCONFIG
    global EQFILEMOUNTPT
    global REGISTRYLOCATION
    global WEBSERVERPORT
    global ADAPTERPORT
    global ADAPTERLIST
    global SPECIALDATADICT
    global USENETDATA
    global USEDNS
    global USEPORTAINER


    composeyml = [{ 
        'version': '3.9', 
        'services': { },
        'configs': { },
        'volumes':{
            'portainer_data': None
        },
        'networks':{
            'outside':{
                'external':{
                    'name': "host"
                }
            },
            'agent_network':{
                'driver':'overlay',
                'attachable': True
            }
        }
    }]

    composeyml[0]["configs"][EQFILEMOUNTPT.strip("/")] = {}
    composeyml[0]["configs"][EQFILEMOUNTPT.strip("/")]["file"] = EQPATH
    composeyml[0]["configs"][KEYMOUNT.strip("/")] = {}
    composeyml[0]["configs"][KEYMOUNT.strip("/")]["file"] = CERTFOLDER+"/privkey.pem"
    composeyml[0]["configs"][CERTMOUNT.strip("/")] = {}
    composeyml[0]["configs"][CERTMOUNT.strip("/")]["file"] = CERTFOLDER+"/fullchain.pem"

    # webserver service
    webserver = DockerService("web", 8080,1,'Webserver')
    webserver.deploiment_global()
    composeyml[0]["services"]["web"] = webserver.getYAML()

    
    webserver.deploiment_global()
    composeyml[0]["services"]["web"] = webserver.getYAML()
    #composeyml[0]["services"]["ControllAPI"] = {
    #        'image': REGISTRYLOCATION + '/exui_' + 'controllapi',
    #        'build': {
    #            'context': './BackendAPI/Controll',
    #            'dockerfile': DOCKERFILENAME
    #        },
    #        'ports':[
    #            "10000:10000"
    #        ],
    #    'deploy':{
    #        'mode': 'global',
    #    },'tty':True,
    #    'configs':[
    #        'eqconfig',
    #        'key',
    #        'cert'
    #    ],
    #    'entrypoint':[
    #        '/bin/sh',
    #        '-c',
    #        'node API.js'
    #    ]
    #}   
    composeyml[0]["services"]["DataAPI"] = {
            'image': REGISTRYLOCATION + '/exui_' + 'dataapi',
            'build': {
                'context': './BackendAPI/DATA',
                'dockerfile': DOCKERFILENAME
            },
            'ports':[
                "9100:9100"
            ],
        'deploy':{
            'mode': 'global',
        },'tty':True,
        'configs':[
            'eqconfig',
            'key',
            'cert'
        ],
        'entrypoint':[
            '/bin/sh',
            'start.sh'
        ]
    } 

    #redisnodes = "redis-node-master"
    #for i in range(1,6):
    #    redisnodes += " redis-node-"+str(i)
    #
    #for i in range(1,6):
    #    composeyml[0]["services"]["redis-node-"+str(i)] = {
    #        'image': 'docker.io/bitnami/redis-cluster:7.2',
    #        'environment':[
    #            'ALLOW_EMPTY_PASSWORD=yes',
    #            'REDIS_NODES='+redisnodes
    #        ]
    #    } 

    #composeyml[0]["services"]["redis-node-master"] = {
    #    'image': 'docker.io/bitnami/redis-cluster:7.2',
    #    'environment':[
    #        'ALLOW_EMPTY_PASSWORD=yes',
    #        'REDIS_CLUSTER_REPLICAS=1',
    #        'REDIS_CLUSTER_CREATOR=yes',
    #        'REDIS_NODES='+redisnodes
    #    ]
    #} 

    
    composeyml[0]["services"]["redis"] = {
        'image': 'redis:latest',
    } 

    if USEPORTAINER:
        composeyml[0]["services"]["Portainer"] = {
            'image': 'portainer/portainer-ce:latest',
            'command': '-H tcp://tasks.agent:9001 --tlsskipverify',
            'ports':[
                "9443:9443",
                "9000:9000",
                "8000:8000"
            ],
        'volumes':[
            'portainer_data:/data'
        ],
        'networks':[
            'agent_network'
        ],
        'deploy':{
            'mode': 'replicated',
            'replicas': 1,
            'placement':{
                'constraints': ['node.role == manager']
            }
        }
        }   
        composeyml[0]["services"]["agent"]={
            'image': 'portainer/agent:latest',
            'volumes':[
                '/var/run/docker.sock:/var/run/docker.sock',
                '/var/lib/docker/volumes:/var/lib/docker/volumes'
            ],
            'networks':[
                'agent_network'
            ],
            'deploy':{
                'mode': 'global',
                'placement':{
                    'constraints': ['node.platform.os == linux']
                }
            }
        }
       

    if USENETDATA:
        # netdata service
        composeyml[0]["services"]["netdata"] = {
            'image': '127.0.0.1:5000/exui_netdata',
            'build': {
                'context': './adapters/netdata',
                'dockerfile': 'Dockerfile'
            },
            'container_name': 'netdata',
            'ports': [],
            'cap_add': [ 'SYS_PTRACE' ],
            'security_opt': [ 'apparmor:unconfined'],
            'volumes': [
                'netdataconfig:/etc/netdata',
                'netdatalib:/var/lib/netdata',
                'netdatacache:/var/cache/netdata',
                '/etc/passwd:/host/etc/passwd:ro',
                '/etc/group:/host/etc/group:ro',
                '/proc:/host/proc:ro',
                '/sys:/host/sys:ro',
                '/etc/os-release:/host/etc/os-release:ro'
            ],
            'deploy': {
                'mode': 'global' # runs netdata container on every node
            }
        }
        composeyml[0]["volumes"]['netdataconfig']={}
        composeyml[0]["volumes"]['netdatalib']={}
        composeyml[0]["volumes"]['netdatacache']={}
      


        portrange = [20001, 20001]
        for pc in EQCONFIG["computers"]:
            composeyml[0]["services"]["netdata"]["ports"].append(str(portrange[0]) + 
                "-" + str(portrange[1]) + ":" + "19999")
            portrange[1] += 1

    if USEDNS:
        composeyml[0]["services"]["bind9"] = {
            'image': '127.0.0.1:5000/bind9',
            'build': {
                'context': BINDFOLDER,
                'dockerfile': 'Dockerfile'
            },
            'ports': [
                str(53)+":"+str(53)+"/tcp",
                str(53)+":"+str(53)+"/udp"
            ],
            'container_name':'BIND9',
            'environment':[
                'BIND9_USER=root',
                'TZ=Europe/Berlin'
            ],
            'deploy':{
                'mode': 'global'
            }
        }
    
    composeyml[0]["services"]["proxy"] = {
            'image': '127.0.0.1:5000/exui_proxy',
            'ports': [
            ],
            "build":{
                "context": PROXYFOLDER +"/",
                "dockerfile" : "Dockerfile"
            },
            'volumes': [
               # PROXYFOLDER + "/mapredirect.conf:/etc/apache2/sites-available/mapredirect.conf"
            ],
            'configs':[
                'cert',
                'key'
            ],
            'deploy':{
                'mode': 'global'
            }


        }
    if USEMAPSERVER:
        composeyml[0]["services"]["mapserver"] = {
            'image': 'klokantech/tileserver-gl',
            'ports': [
                str(8100)+":"+str(80)
            ],
            'volumes': [
                MAPFOLDER
            ]
        }
        composeyml[0]["services"]["proxy"]["ports"].append(str(8001)+":"+str(443))
    writeProxyConfig("443","http://exui.de:8100/","mapredirect.conf") #XX currently needing to ensure redirect confs are always there
    if USEVIDEO:
        Videoport = 8082
        ProxyPort = 8102
        ApachePort = 402
        for i, Video in enumerate(EQCONFIG["Video"]):
            EQCONFIG["Video"][i]["http_port"] = Videoport
            EQCONFIG["Video"][i]["Port"] = ProxyPort
            composeyml[0]["services"][Video["name"]] = DockerService("video",8082, i,"Video"+Video["name"]).getYAML()
            #composeyml[0]["services"][Video["name"]]["entrypoint"].append('go run *.go')
            del composeyml[0]["services"][Video["name"]]["ports"]
            composeyml[0]["services"][Video["name"]]["networks"] = ["outside"]
            writeProxyConfig(str(ApachePort),"http://exui.de:"+str(Videoport)+'/',"videoredirect_"+Video["name"]+".conf")  #XX get ip fromConfig
            composeyml[0]["services"][Video["name"]]["deploy"]["replicas"]=EQCONFIG["Video"][i]["numreplica"]
            composeyml[0]["services"]["proxy"]["ports"].append(str(ProxyPort)+":"+str(ApachePort))
            appendtoProxyDocker(ApachePort,Video["name"])
            Videoport+=1
            ProxyPort+=1
            ApachePort +=1

    if "TrackingAntenna" in EQCONFIG:
        composeyml[0]["services"]["TrackingAntenna"]=DockerService("wtw",0,1,'wtw').getYAML()

    neededAdapters = {}
    usedAdaptersamount = {}
    curfreeport = 9001

    for i, source in enumerate(EQCONFIG["datasources"]):
        if source["type"].casefold() in ADAPTERLIST:
            # Check which adapter is needed for data source
            if source["type"].casefold() in usedAdaptersamount:
                usedAdaptersamount[source["type"].casefold()] += 1
            else:
                usedAdaptersamount[source["type"].casefold()] = 1

            port = False
            if 'openport' in source:
                port = int(source['openport'])

            neededAdapters[source["name"].casefold()] = DockerService(
                source["type"].lower(), port, usedAdaptersamount[source["type"].casefold()],source['name'])   

            try:
                neededAdapters[source["name"].casefold()].increaseReplicas(source["numreplica"])
            except:
                pass
            # put port in eqconfig
            # try:
            #     if source["sourceport"] != 0: //XX aprs currently not in use
            #         if source["type"].casefold() == "aprs":
            #             neededAdapters[source["name"].casefold()].exposeSourcePortUDP(source["sourceport"])
            #         # expose the UDP port of the Aprs adapter to allowconnection
            # except:
            #     #print("Sourceport not defined skipping exposal")
            #     pass

        else:
            print(f"WARN: Data source type {source['type']} is not supported!\n" +
                f"Supported types: {ADAPTERLIST}")

    # Check if any data source supplies special data
    for datatype in SPECIALDATADICT:
        for adapter in SPECIALDATADICT[datatype]:
            for i, src in enumerate(EQCONFIG["datasources"]):
                for j, datapoints in enumerate(src["datapoints"]):
                    try:
                        if adapter == datapoints["adapter"]:
                            if adapter.casefold() in usedAdaptersamount:
                                usedAdaptersamount[datapoints["adapter"].casefold()] += 1
                            else:
                                usedAdaptersamount[datapoints["adapter"].casefold()] = 1
                            neededAdapters[src["key"]+"_"+ datapoints["name"].casefold()] = DockerService( 
                                    adapter.casefold(), curfreeport,usedAdaptersamount[datapoints["adapter"].casefold()],datapoints['name'])
                            # put port in eqconfig
                            EQCONFIG["datasources"][i]["datapoints"][j]["destport"] = curfreeport
                            try:
                                neededAdapters[datapoints["name"].casefold()].increaseReplicas(datapoints["numreplica"])
                            except:
                                pass
                            curfreeport += 1
                    except:
                        #print("no other adapter specified assuming standard source adapter")
                        pass
    for service in neededAdapters:
        composeyml[0]["services"][service] = neededAdapters[service].getYAML()

    # save docker-compose.yml
    try:
        ymlfile = open("./docker-compose.yml", "w")
    except OSError:
        print("ERROR: Could not open docker-compose.yml")
        sys.exit(1)

    safe_dump_all(composeyml, ymlfile, sort_keys=False, indent=2)

    # save eqconfig
    try:
        eqfile = open(EQPATH, "w")
        json.dump(EQCONFIG, eqfile, indent=4)
    except OSError:
        print("Could not open eq config file " + EQPATH +" Maybe it is in a protected directory?")
        sys.exit(1)

def buildDockerCompose():
    process = sh.Popen(["docker", "compose", "build"])
    process.wait()
    if process.returncode != 0:
        print("ERROR: Docker compose build failed.")
        sys.exit(1)

def pushDockerCompose():
    process = sh.Popen(["docker", "compose", "push"])
    process.wait()
    if process.returncode != 0:
        print("ERROR: Docker compose push failed.")
        sys.exit(1)

def dockerStackDeploy():
    process = sh.Popen(["docker", "stack", "deploy", "--compose-file", "docker-compose.yml", "exui"])
    process.wait()
    if process.returncode != 0:
        print("ERROR: Docker stack deploy failed.")
        sys.exit(1)
def initiateProxyDocker():
    file = open(PROXYFOLDER+"/Dockerfile","w")
    file.write("FROM ubuntu/apache2:latest\nCOPY . /etc/apache2/sites-available\nRUN a2enmod ssl\nRUN a2enmod rewrite\nRUN a2enmod proxy_http\nRUN a2enmod proxy\nRUN a2ensite mapredirect.conf\n")
def appendtoProxyDocker (port, name):
    file = open(PROXYFOLDER+"/Dockerfile","a")
    file.write("RUN a2ensite videoredirect_"+name+".conf\nRUN echo \"Listen "+str(port)+"\" >> /etc/apache2/ports.conf\n")

### MAIN ###
if __name__ == "__main__":
    # Entry Point
    app = QApplication(sys.argv)

    # TODO: Determine appropriate window resolution to fill quarter of screen

    controller = WindowController(860, 540)
    controller.showStartScreen()

    sys.exit(app.exec())
