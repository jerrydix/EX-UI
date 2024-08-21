''' 
    Name: EX-UI Dev Installation Script 
    Authors: Antonio Steiger antonio.steiger@tum.de, Jeremy Dix jeremy.dix@tum.de

    Last Updated: 16.05.24
    
    Purpose:  Prepare personal dev computer for execution of start.py and any EX-UI
              docker container as part of the docker swarm
    
    Important: This script has to be executable on any computer that has
               python3 installed. That means: Only use standard libraries 
               and OS resources (bash, cmd, ...). Make it easy to use,
               dependable, transparent and simple
    
    Approach: - Determine System Environment and choose appropriate
                installation steps (OS, Graphics, ...)
              - Securely and visually acquire root permissions for package
                installs, exui user (group) configuration, ...
              - Install python packages for start.py using pip
              - dynamically expand necessary installation steps depending
                on what has already been done/installed
    
    Roadmap:  - TODO: Only prompt for password if there actually needs to be
                done something that requires root permissions
              - TODO: Support for Windows, other Linux Distros, esp. those 
                lacking bash and or apt
              - TODO: Increase security when handling password, possibly store
                it for later reuse (Needs encryption!)
              - TODO: Automatically add desktop shortcut for start.py
'''

###### IMPORTS ######
import subprocess as sh # Shell Integration
import platform # Computer/Python Information
import os # Graphics Environent
from importlib.util import find_spec # Check for python packages
from urllib import request
from urllib.error import HTTPError, URLError

###### FUNCTIONS ######
def _print(input):
    print("[Install:] " + str(input))

def _printerr(input):
    print("[ERROR:] " + str(input))

def checkPlatform():
    # Determines platform, checks it for compatibility and passes on the OS 
    _print("Determining platform...")
    OS = platform.system()
    PYVER = platform.python_version()
    MACHINE = platform.machine()

    if PYVER.startswith('3'): #TODO: Check machine
        return (MACHINE, OS)
    else:
        _printerr("Python version " + PYVER + " is not supported.")
        exit()

def linux_isCMDAvailable(command):
    # GEANT PROJECT
    shell_command = sh.Popen(['which', command],
                                        stdout=sh.PIPE,
                                        stderr=sh.PIPE)
    shell_command.wait()
    if shell_command.returncode == 0:
        return True
    else:
        return False

def linux_checkPKGMGR():
    for cmd in ['apt', 'pacman', 'yum']: # Add more package managers here
            if linux_isCMDAvailable(cmd) == True:
                return cmd

def linux_checkGFX():
    # GEANT PROJECT
    _print("Determining graphics environment...")
    if os.environ.get('DISPLAY') is not None:
        for cmd in ['zenity', 'kdialog', 'yad']:
            if linux_isCMDAvailable(cmd) == True:
                return cmd
        return -1

def linux_promptInput(GFX, text):
    # GEANT PROJECT
    
    if GFX == 'zenity':
        command = ['zenity', '--entry', '--hide-text',
                    '--width=500', '--text=' + text]
    # Add more GFX support here
    else:
        _printerr("Graphics environment not supported!")
        exit()

    output = ''
    while not output:
        shell_command = sh.Popen(command,   stdout=sh.PIPE,
                                            stderr=sh.PIPE)
        out, _ = shell_command.communicate()
        output = out.decode('utf-8')
        if GFX == 'yad':
            output = output[:-2]
        output = output.strip()
        if shell_command.returncode == 1:
            _printerr("User quit or prompt could not be opened.")
            exit()
    return output

def linux_handleRootTasks(GFX, PKGMGR):
    # Password handling in this function should be most secure as it is implemented.
    # Encryption is not necessary here, because the password does not have to be stored.
    # A root process is created quickly and the password can be discarded.
    
    _print("Asking for password...")
    pw1 = "a"
    pw2 = "b"
    # Get Password
    while pw1 != pw2:
        # GEANT Project Code
        pw1 = linux_promptInput(GFX, "Please enter your password to " + 
                                    "authorize package installations:")
        pw2 = linux_promptInput(GFX, "Repeat password to confirm")
        if pw1 != pw2:
            linux_alert(GFX, "Passwords differ! Try again")

    # Check if bash is installed
    if linux_isCMDAvailable("bash") == False:
        _printerr("Couldn't find bash! Bash shell is currently required for Linux installation process.")
        exit() # TODO: implement different installation processes depending on shell, similar to GFX commands

    # Dynamically create installation script
    installcmds = ""

    # Use id as the first, dummy sudo command to acquire root permissions
    installcmds = "echo \"" + pw1 + "\"| sudo -S id\n" + installcmds
    # Clear password from memory
    pw1 = None
    pw2 = None
    # Add exui user (only if non existant)
    _print("Adding EX-UI user if necessary...")
    # Add system installation commands
    if(PKGMGR == "apt"):
        if linux_isCMDAvailable("ssh") == False:
            _print("Could not find ssh client, will install...")
            installcmds += "sudo apt-get update\n"
            installcmds += "sudo apt-get install -y openssh-client\n"

        if linux_isCMDAvailable("sshd") == False:
            _print("Could not find ssh server, will install...")
            installcmds += "sudo apt-get update\n"
            installcmds += "sudo apt-get install -y openssh-server\n"
        else:
            installcmds += "sudo systemctl enable --now ssh\n"

        # TODO?: Use docker-machine for more simplicity and compatibility (But uses VMs)
        if linux_isCMDAvailable("docker") == False:
            _print("Could not find docker, will install...")
            # Install Docker
            installcmds += "sudo apt-get update\n"
            installcmds += "sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common\n"
            installcmds += "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg\n"
            installcmds += "echo \"deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable\" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null\n"
            installcmds += "sudo apt-get update\n"
            installcmds += "apt-cache policy docker-ce\n"
            installcmds += "sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin\n"
            installcmds += "sudo usermod -aG docker ${USER}\n"
            installcmds += "sudo systemctl enable docker\n"
            # Install Docker Compose
            installcmds += "mkdir -p ~/.docker/cli-plugins/\n"
            installcmds += "curl -SL https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose\n"
            installcmds += "chmod +x ~/.docker/cli-plugins/docker-compose\n"
        else:
            installcmds += "sudo usermod -aG docker ${USER}\n"
        if linux_isCMDAvailable("node") == False:
            _print("Could not find node, will install it")
            installcmds += "sudo apt-get update\n"
            installcmds += "sudo apt-get install -y nodejs npm"

        if linux_isCMDAvailable("pip") == False:
            _print("Could not find pip, will install...")
            installcmds += "sudo apt-get update\n"
            installcmds += "sudo apt-get install -y python3-pip\n"

        installcmds += "sudo apt-get install -y libxcb-cursor0\n" # Required for Qt6
    else:
        _printerr("Package manager not supported. Exiting...")
        exit()
        
        
    # open bash and execute all system install commands
    _print("Starting main installation process. This can take a few minutes...")
    process = sh.Popen('/bin/bash', stdin=sh.PIPE, stdout=sh.PIPE)
    out, err = process.communicate(installcmds.encode("utf-8"))
    _print(out.decode("utf-8"))
    process.wait() # end installation process with root permissions
    installcmds = None # contains password, so remove from memory

    return

def linux_installPyDeps():
    # Dynamically install libraries used in start.py
    pipcmds = ""

    # Remove EXTERNALLY-MANAGED file
    if linux_isCMDAvailable("apt"):
        rm_ext_managed = f"sudo rm /usr/lib/python3.{platform.python_version_tuple()[1]}/EXTERNALLY-MANAGED\n"
        _print("Now removing EXTERNALLY-MANAGED file if it exists...")
        process = sh.Popen('/bin/bash', stdin=sh.PIPE, stdout=sh.PIPE)
        out, err = process.communicate(rm_ext_managed.encode("utf-8"))
        process.wait()

    # User interface
    if find_spec("PySide6") == None:
        pipcmds += "sudo pip install PySide6\n"
    # YAML Parsing for docker-compose.yml
    if find_spec("PyYAML") == None:
        pipcmds += "sudo pip install PyYAML\n"
    # Pythonic SSH access for adding swarm nodes
    if find_spec("paramiko") == None:
        pipcmds += "sudo pip install paramiko\n"
    # Listing network interfaces
    if find_spec("netifaces") == None:
        pipcmds += "sudo pip install netifaces\n"
     # Connecting and querring OPCUA stuff
    if find_spec("opcua") == None:
        pipcmds += "sudo pip install opcua\n"

    # open bash and execute all pip commands
    _print("Now installing python packages...")
    process = sh.Popen('/bin/bash', stdin=sh.PIPE, stdout=sh.PIPE)
    out, err = process.communicate(pipcmds.encode("utf-8"))
    _print(out.decode("utf-8"))
    process.wait()

    return

def linux_alert(GFX, text):
    # GEANT PROJECT
    """Generate alert message"""
    if GFX == 'zenity':
        command = ['zenity', '--warning', '--text=' + text]
    elif GFX == "kdialog":
        command = ['kdialog', '--sorry', text]
    elif GFX == "yad":
        command = ['yad', '--text=' + text]
    else:
        exit(1)
    sh.call(command, stderr=sh.DEVNULL)

def linux_copyPlugins():
    process = sh.Popen(["cp", "-r", "./plugins/OpenMCT/.", "./webserver/src/plugins/"])
    process.wait()

def linux_creatBind9Folder():
    try:
        process = sh.Popen(["mkdir", "Bind9"])
        process.wait()
        process = sh.Popen(["mkdir", "Bind9/config"])
        process.wait()
        process = sh.Popen(["mkdir", "Bind9/cache"])
        process.wait()
        process = sh.Popen(["mkdir", "Bind9/records"])
        process.wait()
    except:
        print("Bind9 folders couldn't be created if you have them already created everything is fine otherway try adding them manualy (have a look at the wiki)")

def linux_creatMAPdataFolder():
    try:
        process = sh.Popen(["mkdir", "mapserver/mapserver/data"])
        process.wait()
    except:
        print("Mapdata folder couldn't be created if you have them already created everything is fine otherway try adding them manualy (have a look at the wiki)") 

def linux_pullDockerRegistry():
    process = sh.Popen(["sudo", "docker", "pull", "registry:latest"])
    process.wait()

def linux_createDockerRegistry():
    process =   sh.Popen(["sudo", "docker", "service", "create", "--name", "registry",
                    "--publish", "5000:5000", "registry:2"])
    process.wait()
    # TODO: suppress error msg if registry already exists


def verifyInternetConnection():
    try:
        request.urlopen("https://archlinux.org", timeout=5)
        return True
    except HTTPError:
        return False
    except URLError:
        return False

###### MAIN ######
if __name__ == "__main__":
    # Entry Point
    _print("###### EX-UI Dev Installation Script ######")

    MACHINE = ""
    OS = ""
    PKGMGR = ""
    GFX = ""

    REQS = ""

    MACHINE, OS = checkPlatform()
    if OS == "Linux":
        PKGMGR = linux_checkPKGMGR()
        GFX = linux_checkGFX()
        
        if verifyInternetConnection() == True:
            linux_handleRootTasks(GFX, PKGMGR)
            linux_installPyDeps()
            linux_pullDockerRegistry()
            linux_createDockerRegistry()
            linux_copyPlugins()
            linux_creatBind9Folder()
            linux_creatMAPdataFolder()
            _print("Installation complete. You can use start.py now.")
            _print("IF YOU PLAN ON USING THE LOCAL MAPSERVER PLEASE DOWNLOAD THE MAPTILES FROM HERE https://download.geofabrik.de/europe.html \n AND PLACE THEM IN mapserver/mapserver/data")
            exit(0)  
        else:
            print("WARN: You are not connected to the internet!")
            linux_copyPlugins()
            linux_creatBind9Folder()
            linux_creatMAPdataFolder()
            _print("Installation complete, but WARN: internet connection was unavailable. Packages might be missing.")
            exit(0)
      
    # Add support for more OSs here
    else:
        _printerr("Platform " + OS + "  " + MACHINE + " is not supported")
        exit(1)